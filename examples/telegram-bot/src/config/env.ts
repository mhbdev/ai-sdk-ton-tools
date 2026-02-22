import { z } from "zod";
import type { BotRunMode } from "@/types/contracts";

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).optional(),
);

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }

    return value;
  },
  z.boolean().optional(),
);

const csvStringListFromEnv = z.preprocess(
  (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value !== "string") {
      return value;
    }
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  z.array(z.string().min(1)).default([]),
);

const integerFromEnv = (input: {
  min: number;
  max: number;
  defaultValue: number;
}) =>
  z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? Math.trunc(value) : value;
      }
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return undefined;
      }

      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : value;
    },
    z.number().int().min(input.min).max(input.max).default(input.defaultValue),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(
      /^\d{6,}:[^\s:]{20,}$/,
      "must look like a BotFather token (digits:secret)",
    ),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  BOT_RUN_MODE: z.enum(["webhook", "polling"]).default("webhook"),
  TELEGRAM_POLLING_TIMEOUT_SECONDS: integerFromEnv({
    min: 1,
    max: 50,
    defaultValue: 10,
  }),
  TELEGRAM_POLLING_LIMIT: integerFromEnv({
    min: 1,
    max: 100,
    defaultValue: 100,
  }),
  BOT_ADMIN_TOKEN: z.string().min(1),
  TONAPI_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  AI_GATEWAY_API_KEY: optionalNonEmptyString,
  AI_MODEL: z.string().min(1).default("openai/gpt-5.2"),
  AI_GATEWAY_FALLBACK_MODEL: optionalNonEmptyString,
  AI_TOPIC_MODEL: z.string().min(1).default("openai/gpt-4o-mini"),
  POSTGRES_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KMS_KEY_ID: z.string().min(1),
  ENCRYPTION_MASTER_KEY: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalNonEmptyString,
  TELEGRAM_ENABLE_STREAM_DRAFTS: booleanFromEnv.default(true),
  TOPIC_AUTOCREATE_ENABLED: booleanFromEnv.default(true),
  RATE_LIMIT_TRUSTED_USER_IDS: csvStringListFromEnv,
  RATE_LIMIT_BURST_WINDOW_SECONDS: integerFromEnv({
    min: 1,
    max: 300,
    defaultValue: 3,
  }),
  RATE_LIMIT_MINUTE_WINDOW_SECONDS: integerFromEnv({
    min: 1,
    max: 600,
    defaultValue: 60,
  }),
  RATE_LIMIT_CHAT_MINUTE_MAX: integerFromEnv({
    min: 1,
    max: 10_000,
    defaultValue: 200,
  }),
  RATE_LIMIT_FREE_BURST_MAX: integerFromEnv({
    min: 1,
    max: 1_000,
    defaultValue: 3,
  }),
  RATE_LIMIT_FREE_MINUTE_MAX: integerFromEnv({
    min: 1,
    max: 10_000,
    defaultValue: 10,
  }),
  RATE_LIMIT_FREE_DAILY_MAX: integerFromEnv({
    min: 1,
    max: 1_000_000,
    defaultValue: 300,
  }),
  RATE_LIMIT_TRUSTED_MULTIPLIER: integerFromEnv({
    min: 1,
    max: 100,
    defaultValue: 5,
  }),
  RATE_LIMIT_NOTICE_COOLDOWN_SECONDS: integerFromEnv({
    min: 1,
    max: 600,
    defaultValue: 20,
  }),
  APPROVAL_UX_V2_ENABLED: booleanFromEnv.default(true),
  PERSONALIZATION_UX_ENABLED: booleanFromEnv.default(true),
  MULTI_WALLET_ENABLED: booleanFromEnv.default(true),
  APP_BASE_URL: z.string().url(),
  TONCONNECT_MANIFEST_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema> & {
  BOT_RUN_MODE: BotRunMode;
};

let cachedEnv: AppEnv | null = null;

export const getEnv = (): AppEnv => {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  cachedEnv = parsed.data as AppEnv;
  return cachedEnv;
};
