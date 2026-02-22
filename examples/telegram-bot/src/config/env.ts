import { z } from "zod";
import type { BotRunMode } from "@/types/contracts";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  BOT_RUN_MODE: z.enum(["webhook", "polling"]).default("webhook"),
  BOT_ADMIN_TOKEN: z.string().min(1),
  TONAPI_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  AI_GATEWAY_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1).default("openai/gpt-5.2"),
  AI_GATEWAY_FALLBACK_MODEL: z.string().optional(),
  POSTGRES_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  KMS_KEY_ID: z.string().min(1),
  ENCRYPTION_MASTER_KEY: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
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
