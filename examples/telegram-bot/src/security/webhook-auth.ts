import type { FastifyRequest } from "fastify";
import { getEnv } from "@/config/env";

export const verifyWebhookSecret = (
  request: FastifyRequest,
  pathSecret: string,
) => {
  const env = getEnv();
  if (pathSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return false;
  }

  const headerSecret = request.headers["x-telegram-bot-api-secret-token"];
  if (typeof headerSecret !== "string") {
    return true;
  }

  return headerSecret === env.TELEGRAM_WEBHOOK_SECRET;
};

export const verifyAdminBearerToken = (request: FastifyRequest) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token === getEnv().BOT_ADMIN_TOKEN;
};

