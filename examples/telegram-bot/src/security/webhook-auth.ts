import type { FastifyRequest } from "fastify";
import { getEnv } from "@/config/env";

export const verifyWebhookSecret = (
  request: FastifyRequest,
  pathSecret?: string,
) => {
  const env = getEnv();
  const headerSecret = request.headers["x-telegram-bot-api-secret-token"];
  const hasHeaderSecret =
    typeof headerSecret === "string" && headerSecret.length > 0;

  if (pathSecret && decodeURIComponent(pathSecret) !== env.TELEGRAM_WEBHOOK_SECRET) {
    return false;
  }

  if (pathSecret) {
    if (!hasHeaderSecret) {
      return true;
    }

    return headerSecret === env.TELEGRAM_WEBHOOK_SECRET;
  }

  if (!hasHeaderSecret) {
    return false;
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
