import { redis } from "@/queue/connection";

export const checkAndIncrementRateLimit = async (input: {
  key: string;
  max: number;
  windowSeconds: number;
}) => {
  const key = `ratelimit:${input.key}`;
  const value = await redis.incr(key);
  if (value === 1) {
    await redis.expire(key, input.windowSeconds);
  }
  return value <= input.max;
};

