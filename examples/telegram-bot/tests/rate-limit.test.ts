import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type Entry = {
    value: number;
    expiresAt: number;
  };

  const defaultEnv = {
    RATE_LIMIT_TRUSTED_USER_IDS: [] as string[],
    RATE_LIMIT_BURST_WINDOW_SECONDS: 3,
    RATE_LIMIT_MINUTE_WINDOW_SECONDS: 60,
    RATE_LIMIT_CHAT_MINUTE_MAX: 200,
    RATE_LIMIT_FREE_BURST_MAX: 3,
    RATE_LIMIT_FREE_MINUTE_MAX: 10,
    RATE_LIMIT_FREE_DAILY_MAX: 300,
    RATE_LIMIT_TRUSTED_MULTIPLIER: 5,
    RATE_LIMIT_NOTICE_COOLDOWN_SECONDS: 20,
  };

  const env = { ...defaultEnv };
  const counters = new Map<string, Entry>();
  const notices = new Map<string, Entry>();
  let failEval = false;
  let failSet = false;

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const getLiveEntry = (store: Map<string, Entry>, key: string) => {
    const existing = store.get(key);
    if (!existing) {
      return null;
    }
    if (existing.expiresAt <= nowSeconds()) {
      store.delete(key);
      return null;
    }
    return existing;
  };

  const evalFn = vi.fn(
    async (_script: string, _numKeys: number, key: string, ttlArg: string) => {
      if (failEval) {
        throw new Error("redis eval failed");
      }

      const ttl = Number(ttlArg);
      const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? Math.trunc(ttl) : 1;
      let entry = getLiveEntry(counters, key);
      if (!entry) {
        entry = {
          value: 0,
          expiresAt: nowSeconds() + ttlSeconds,
        };
        counters.set(key, entry);
      }

      entry.value += 1;
      const remaining = Math.max(1, entry.expiresAt - nowSeconds());
      return [entry.value, remaining];
    },
  );

  const setFn = vi.fn(
    async (
      key: string,
      _value: string,
      _exKeyword: string,
      ttlSeconds: number,
      _nxKeyword: string,
    ) => {
      if (failSet) {
        throw new Error("redis set failed");
      }

      const existing = getLiveEntry(notices, key);
      if (existing) {
        return null;
      }

      notices.set(key, {
        value: 1,
        expiresAt: nowSeconds() + ttlSeconds,
      });
      return "OK";
    },
  );

  return {
    env,
    defaultEnv,
    evalFn,
    setFn,
    reset() {
      Object.assign(env, defaultEnv);
      counters.clear();
      notices.clear();
      failEval = false;
      failSet = false;
      evalFn.mockClear();
      setFn.mockClear();
    },
    setEvalFailure(value: boolean) {
      failEval = value;
    },
    setSetFailure(value: boolean) {
      failSet = value;
    },
  };
});

vi.mock("@/config/env", () => ({
  getEnv: () => harness.env,
}));

vi.mock("@/queue/connection", () => ({
  redis: {
    eval: harness.evalFn,
    set: harness.setFn,
  },
}));

vi.mock("@/observability/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  checkChatSpamLimit,
  checkUserTurnQuota,
  formatRateLimitMessage,
  shouldSendRateLimitNotice,
} from "@/security/rate-limit";

describe("rate-limit policy", () => {
  beforeEach(() => {
    harness.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests below limits", async () => {
    const chatDecision = await checkChatSpamLimit({
      telegramChatId: "9001",
      telegramUserId: "1001",
    });
    expect(chatDecision.allowed).toBe(true);

    const userDecision = await checkUserTurnQuota({
      telegramUserId: "1001",
    });
    expect(userDecision).toMatchObject({
      allowed: true,
      reason: "allowed",
      tier: "free",
      dailyUsed: 1,
      dailyLimit: 300,
    });
    expect(userDecision.resetsAtUtc?.toISOString()).toBe("2026-02-23T00:00:00.000Z");
  });

  it("denies burst at the 4th request in 3 seconds", async () => {
    harness.env.RATE_LIMIT_FREE_MINUTE_MAX = 100;
    harness.env.RATE_LIMIT_FREE_DAILY_MAX = 1000;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const decision = await checkUserTurnQuota({
        telegramUserId: "2001",
      });
      expect(decision.allowed).toBe(true);
    }

    const denied = await checkUserTurnQuota({
      telegramUserId: "2001",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("user_burst");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("denies minute quota at the 11th request in 60 seconds", async () => {
    harness.env.RATE_LIMIT_FREE_BURST_MAX = 100;
    harness.env.RATE_LIMIT_FREE_MINUTE_MAX = 10;
    harness.env.RATE_LIMIT_FREE_DAILY_MAX = 1000;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const decision = await checkUserTurnQuota({
        telegramUserId: "3001",
      });
      expect(decision.allowed).toBe(true);
    }

    const denied = await checkUserTurnQuota({
      telegramUserId: "3001",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("user_minute");
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("denies daily quota at the 301st request and returns reset metadata", async () => {
    harness.env.RATE_LIMIT_FREE_BURST_MAX = 1000;
    harness.env.RATE_LIMIT_FREE_MINUTE_MAX = 1000;
    harness.env.RATE_LIMIT_FREE_DAILY_MAX = 300;

    for (let attempt = 1; attempt <= 300; attempt += 1) {
      const decision = await checkUserTurnQuota({
        telegramUserId: "4001",
      });
      expect(decision.allowed).toBe(true);
    }

    const denied = await checkUserTurnQuota({
      telegramUserId: "4001",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("user_daily");
    expect(denied.dailyUsed).toBe(301);
    expect(denied.dailyLimit).toBe(300);
    expect(denied.resetsAtUtc?.toISOString()).toBe("2026-02-23T00:00:00.000Z");
    expect(formatRateLimitMessage(denied)).toContain("2026-02-23 00:00 UTC");
  });

  it("applies trusted tier multiplier", async () => {
    harness.env.RATE_LIMIT_TRUSTED_USER_IDS = ["5001"];
    harness.env.RATE_LIMIT_FREE_MINUTE_MAX = 500;
    harness.env.RATE_LIMIT_FREE_DAILY_MAX = 5000;

    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const decision = await checkUserTurnQuota({
        telegramUserId: "5001",
      });
      expect(decision.allowed).toBe(true);
      expect(decision.tier).toBe("trusted");
    }

    const denied = await checkUserTurnQuota({
      telegramUserId: "5001",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.tier).toBe("trusted");
    expect(denied.reason).toBe("user_burst");
  });

  it("denies chat flood at the 201st message per minute", async () => {
    for (let attempt = 1; attempt <= 200; attempt += 1) {
      const decision = await checkChatSpamLimit({
        telegramChatId: "7001",
        telegramUserId: "7101",
      });
      expect(decision.allowed).toBe(true);
    }

    const denied = await checkChatSpamLimit({
      telegramChatId: "7001",
      telegramUserId: "7101",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("chat_flood");
  });

  it("suppresses repeated notices during cooldown", async () => {
    const first = await shouldSendRateLimitNotice({
      telegramUserId: "8001",
      reason: "user_minute",
    });
    const second = await shouldSendRateLimitNotice({
      telegramUserId: "8001",
      reason: "user_minute",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    vi.advanceTimersByTime(21_000);

    const third = await shouldSendRateLimitNotice({
      telegramUserId: "8001",
      reason: "user_minute",
    });
    expect(third).toBe(true);
  });

  it("fails open when Redis limiter calls fail", async () => {
    harness.setEvalFailure(true);

    const chatDecision = await checkChatSpamLimit({
      telegramChatId: "9001",
      telegramUserId: "9002",
    });
    expect(chatDecision).toMatchObject({
      allowed: true,
      reason: "rate_limit_storage_error",
    });

    const userDecision = await checkUserTurnQuota({
      telegramUserId: "9002",
    });
    expect(userDecision).toMatchObject({
      allowed: true,
      reason: "rate_limit_storage_error",
    });

    harness.setSetFailure(true);
    const shouldNotify = await shouldSendRateLimitNotice({
      telegramUserId: "9002",
      reason: "user_minute",
    });
    expect(shouldNotify).toBe(true);
  });
});

