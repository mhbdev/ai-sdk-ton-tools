import IORedis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import { getEnv } from "@/config/env";

const env = getEnv();
const redisUrl = new URL(env.REDIS_URL);

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

export const bullConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
} satisfies ConnectionOptions;
