import type { Update } from "grammy/types";
import type { FastifyInstance } from "fastify";
import { enqueueUpdate } from "@/queue/queues";
import { logger } from "@/observability/logger";
import { markProcessedUpdateStatus, tryInsertProcessedUpdate } from "@/db/queries";
import { verifyWebhookSecret } from "@/security/webhook-auth";

export const registerWebhookRoute = (app: FastifyInstance) => {
  app.post<{ Params: { secret: string } }>(
    "/telegram/webhook/:secret",
    async (request, reply) => {
      const pathSecret = request.params.secret;
      if (!verifyWebhookSecret(request, pathSecret)) {
        logger.warn("Webhook request rejected due to secret mismatch.", {
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
          hasTelegramHeaderSecret:
            typeof request.headers["x-telegram-bot-api-secret-token"] === "string",
        });
        return reply.code(401).send({ ok: false });
      }

      const body = request.body as Update;
      if (!body || typeof body.update_id !== "number") {
        logger.warn("Webhook request rejected due to invalid payload.", {
          remoteAddress: request.ip,
          userAgent: request.headers["user-agent"],
        });
        return reply.code(400).send({ ok: false, error: "Invalid Telegram update" });
      }

      const inserted = await tryInsertProcessedUpdate({
        updateId: body.update_id,
        rawUpdateJson: body,
      });

      if (!inserted.inserted) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }

      await enqueueUpdate({
        updateId: body.update_id,
        correlationId: `update-${body.update_id}`,
      });
      await markProcessedUpdateStatus({
        updateId: body.update_id,
        status: "enqueued",
      });

      logger.info("Webhook update enqueued.", { updateId: body.update_id });
      return reply.code(200).send({ ok: true });
    },
  );
};
