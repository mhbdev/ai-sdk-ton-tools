import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import { redis } from "@/queue/connection";

export type RateLimitTier = "free" | "trusted";

export type RateLimitReason =
  | "allowed"
  | "chat_flood"
  | "user_burst"
  | "user_minute"
  | "user_daily"
  | "rate_limit_storage_error";

export type RateLimitDecision = {
  allowed: boolean;
  reason: RateLimitReason;
  retryAfterSeconds: number;
  tier: RateLimitTier;
  dailyUsed?: number;
  dailyLimit?: number;
  resetsAtUtc?: Date;
};

type RateLimitConfig = {
  burstWindowSeconds: number;
  minuteWindowSeconds: number;
  chatMinuteMax: number;
  noticeCooldownSeconds: number;
  trustedUserIds: Set<string>;
  free: {
    burstMax: number;
    minuteMax: number;
    dailyMax: number;
  };
  trustedMultiplier: number;
};

type CounterResult = {
  count: number;
  ttlSeconds: number;
};

type UtcDailyWindow = {
  dayKey: string;
  counterTtlSeconds: number;
  secondsUntilReset: number;
  resetsAtUtc: Date;
};

type LimitedReason = Extract<
  RateLimitReason,
  "chat_flood" | "user_burst" | "user_minute" | "user_daily"
>;

const KEY_PREFIX = "rl:v1";
const COUNTER_TTL_GRACE_SECONDS = 5;
const DAILY_COUNTER_TTL_GRACE_SECONDS = 60;

const INCR_WITH_TTL_LUA = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local value = redis.call("INCR", key)
if value == 1 then
  redis.call("EXPIRE", key, ttl)
end
local remaining = redis.call("TTL", key)
if remaining < 0 then
  remaining = ttl
end
return { value, remaining }
`;

const asPositiveInt = (value: number) => {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
};

const parseLuaInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
};

const getRateLimitConfig = (): RateLimitConfig => {
  const env = getEnv();
  return {
    burstWindowSeconds: env.RATE_LIMIT_BURST_WINDOW_SECONDS,
    minuteWindowSeconds: env.RATE_LIMIT_MINUTE_WINDOW_SECONDS,
    chatMinuteMax: env.RATE_LIMIT_CHAT_MINUTE_MAX,
    noticeCooldownSeconds: env.RATE_LIMIT_NOTICE_COOLDOWN_SECONDS,
    trustedUserIds: new Set(env.RATE_LIMIT_TRUSTED_USER_IDS),
    free: {
      burstMax: env.RATE_LIMIT_FREE_BURST_MAX,
      minuteMax: env.RATE_LIMIT_FREE_MINUTE_MAX,
      dailyMax: env.RATE_LIMIT_FREE_DAILY_MAX,
    },
    trustedMultiplier: env.RATE_LIMIT_TRUSTED_MULTIPLIER,
  };
};

const getTierForUser = (telegramUserId: string, config: RateLimitConfig): RateLimitTier =>
  config.trustedUserIds.has(telegramUserId) ? "trusted" : "free";

const getTierLimits = (tier: RateLimitTier, config: RateLimitConfig) => {
  if (tier === "trusted") {
    return {
      burstMax: config.free.burstMax * config.trustedMultiplier,
      minuteMax: config.free.minuteMax * config.trustedMultiplier,
      dailyMax: config.free.dailyMax * config.trustedMultiplier,
    };
  }
  return config.free;
};

const getWindowBucket = (windowSeconds: number) =>
  Math.floor(Date.now() / 1000 / windowSeconds);

const getUtcDailyWindow = (): UtcDailyWindow => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  const dayKey = `${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  const nextMidnight = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
  const secondsUntilReset = Math.max(
    1,
    Math.ceil((nextMidnight.getTime() - now.getTime()) / 1000),
  );

  return {
    dayKey,
    counterTtlSeconds: secondsUntilReset + DAILY_COUNTER_TTL_GRACE_SECONDS,
    secondsUntilReset,
    resetsAtUtc: nextMidnight,
  };
};

const incrementCounter = async (key: string, ttlSeconds: number): Promise<CounterResult> => {
  const normalizedTtl = asPositiveInt(ttlSeconds);
  const result = await redis.eval(
    INCR_WITH_TTL_LUA,
    1,
    key,
    String(normalizedTtl),
  );

  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Rate limit counter script returned an invalid response.");
  }

  const count = Math.max(0, parseLuaInt(result[0], 0));
  const ttlFromRedis = parseLuaInt(result[1], normalizedTtl);

  return {
    count,
    ttlSeconds: Math.max(1, ttlFromRedis),
  };
};

const allowedDecision = (
  tier: RateLimitTier,
  extra?: Pick<RateLimitDecision, "dailyUsed" | "dailyLimit" | "resetsAtUtc">,
): RateLimitDecision => ({
  allowed: true,
  reason: "allowed",
  retryAfterSeconds: 0,
  tier,
  ...(extra ? extra : {}),
});

const deniedDecision = (
  tier: RateLimitTier,
  reason: LimitedReason,
  retryAfterSeconds: number,
  extra?: Pick<RateLimitDecision, "dailyUsed" | "dailyLimit" | "resetsAtUtc">,
): RateLimitDecision => ({
  allowed: false,
  reason,
  retryAfterSeconds: Math.max(1, Math.trunc(retryAfterSeconds)),
  tier,
  ...(extra ? extra : {}),
});

const failOpenDecision = (tier: RateLimitTier): RateLimitDecision => ({
  allowed: true,
  reason: "rate_limit_storage_error",
  retryAfterSeconds: 0,
  tier,
});

const formatUtcDateTime = (value: Date) => {
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const min = String(value.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
};

const formatRetrySuffix = (seconds: number) =>
  seconds > 0 ? ` Please wait ${seconds}s and try again.` : "";

export const checkChatSpamLimit = async (input: {
  telegramChatId: string;
  telegramUserId: string;
}): Promise<RateLimitDecision> => {
  const config = getRateLimitConfig();
  const tier = getTierForUser(input.telegramUserId, config);

  try {
    const minuteBucket = getWindowBucket(config.minuteWindowSeconds);
    const key = `${KEY_PREFIX}:chat:${input.telegramChatId}:m:${minuteBucket}`;
    const counter = await incrementCounter(
      key,
      config.minuteWindowSeconds + COUNTER_TTL_GRACE_SECONDS,
    );

    if (counter.count > config.chatMinuteMax) {
      return deniedDecision(tier, "chat_flood", counter.ttlSeconds);
    }

    return allowedDecision(tier);
  } catch (error) {
    logger.warn("Rate limit storage failure (chat scope); allowing request.", {
      reason: "rate_limit_storage_error",
      scope: "chat",
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return failOpenDecision(tier);
  }
};

export const checkUserTurnQuota = async (input: {
  telegramUserId: string;
}): Promise<RateLimitDecision> => {
  const config = getRateLimitConfig();
  const tier = getTierForUser(input.telegramUserId, config);
  const limits = getTierLimits(tier, config);

  try {
    const burstBucket = getWindowBucket(config.burstWindowSeconds);
    const burstKey = `${KEY_PREFIX}:user:${input.telegramUserId}:b:${burstBucket}`;
    const burstCounter = await incrementCounter(
      burstKey,
      config.burstWindowSeconds + COUNTER_TTL_GRACE_SECONDS,
    );
    if (burstCounter.count > limits.burstMax) {
      return deniedDecision(tier, "user_burst", burstCounter.ttlSeconds);
    }

    const minuteBucket = getWindowBucket(config.minuteWindowSeconds);
    const minuteKey = `${KEY_PREFIX}:user:${input.telegramUserId}:m:${minuteBucket}`;
    const minuteCounter = await incrementCounter(
      minuteKey,
      config.minuteWindowSeconds + COUNTER_TTL_GRACE_SECONDS,
    );
    if (minuteCounter.count > limits.minuteMax) {
      return deniedDecision(tier, "user_minute", minuteCounter.ttlSeconds);
    }

    const dailyWindow = getUtcDailyWindow();
    const dailyKey = `${KEY_PREFIX}:user:${input.telegramUserId}:d:${dailyWindow.dayKey}`;
    const dailyCounter = await incrementCounter(dailyKey, dailyWindow.counterTtlSeconds);
    if (dailyCounter.count > limits.dailyMax) {
      return deniedDecision(
        tier,
        "user_daily",
        dailyWindow.secondsUntilReset,
        {
          dailyUsed: dailyCounter.count,
          dailyLimit: limits.dailyMax,
          resetsAtUtc: dailyWindow.resetsAtUtc,
        },
      );
    }

    return allowedDecision(tier, {
      dailyUsed: dailyCounter.count,
      dailyLimit: limits.dailyMax,
      resetsAtUtc: dailyWindow.resetsAtUtc,
    });
  } catch (error) {
    logger.warn("Rate limit storage failure (user scope); allowing request.", {
      reason: "rate_limit_storage_error",
      scope: "user",
      telegramUserId: input.telegramUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return failOpenDecision(tier);
  }
};

export const shouldSendRateLimitNotice = async (input: {
  telegramUserId: string;
  reason: LimitedReason;
}) => {
  const config = getRateLimitConfig();
  const key = `${KEY_PREFIX}:notice:${input.telegramUserId}:${input.reason}`;

  try {
    const result = await redis.set(
      key,
      "1",
      "EX",
      config.noticeCooldownSeconds,
      "NX",
    );
    return result === "OK";
  } catch (error) {
    logger.warn("Rate limit notice cooldown check failed; sending notice.", {
      reason: "rate_limit_storage_error",
      scope: "notice",
      telegramUserId: input.telegramUserId,
      blockedReason: input.reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
};

export const formatRateLimitMessage = (decision: RateLimitDecision) => {
  switch (decision.reason) {
    case "chat_flood":
      return `This chat is sending messages too quickly.${formatRetrySuffix(
        decision.retryAfterSeconds,
      )}`;
    case "user_burst":
      return `You are sending messages too quickly.${formatRetrySuffix(
        decision.retryAfterSeconds,
      )}`;
    case "user_minute":
      return `You reached your per-minute usage limit.${formatRetrySuffix(
        decision.retryAfterSeconds,
      )}`;
    case "user_daily": {
      const used = decision.dailyUsed ?? 0;
      const limit = decision.dailyLimit ?? 0;
      const resetText = decision.resetsAtUtc
        ? formatUtcDateTime(decision.resetsAtUtc)
        : "00:00 UTC";
      return [
        `Daily usage limit reached (${used}/${limit}).`,
        `Resets at ${resetText}.`,
      ].join(" ");
    }
    default:
      return "Rate limit exceeded. Please wait and try again.";
  }
};

