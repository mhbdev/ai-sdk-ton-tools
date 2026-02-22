import Fastify from "fastify";
import { GrammyError } from "grammy";
import type { TelemetryHandle } from "@/observability/telemetry";
import { getBot } from "@/telegram/bot";
import { getEnv } from "@/config/env";
import { getQueueHealth } from "@/queue/health";
import { markProcessedUpdateStatus, getProcessedUpdateById } from "@/db/queries";
import { sql } from "@/db/client";
import { logger } from "@/observability/logger";
import { redis } from "@/queue/connection";
import { enqueueUpdate } from "@/queue/queues";
import {
  createAgentTurnWorker,
  createApprovalTimeoutWorker,
  createDeadLetterWorker,
  createUpdateWorker,
} from "@/jobs";
import { startPollingIngestion } from "@/telegram/polling";
import { registerWebhookRoute } from "@/telegram/webhook";
import { verifyAdminBearerToken } from "@/security/webhook-auth";

type StartRuntimeArgs = {
  telemetry: TelemetryHandle;
};

const throwTelegramAuthHint = (error: unknown): never => {
  if (error instanceof GrammyError && error.error_code === 404) {
    throw new Error(
      "Telegram API returned 404. Check TELEGRAM_BOT_TOKEN in .env.local (invalid token or bot no longer exists).",
      { cause: error },
    );
  }
  throw error;
};

export const startRuntime = async ({ telemetry }: StartRuntimeArgs) => {
  const env = getEnv();
  const app = Fastify({
    logger: false,
  });

  registerWebhookRoute(app);

  app.get("/healthz", async () => ({
    ok: true,
    service: "telegram-ton-agent-bot",
    timestamp: new Date().toISOString(),
  }));

  app.get("/readyz", async (_request, reply) => {
    try {
      await sql.unsafe("select 1");
      await redis.ping();
      const queueHealth = await getQueueHealth();
      return {
        ok: true,
        queueHealth,
      };
    } catch (error) {
      return reply.code(503).send({
        ok: false,
        error: (error as Error).message,
      });
    }
  });

  app.post<{ Body: { updateId: number } }>(
    "/internal/replay-update",
    async (request, reply) => {
      if (!verifyAdminBearerToken(request)) {
        return reply.code(401).send({ ok: false });
      }

      const updateId = request.body?.updateId;
      if (typeof updateId !== "number") {
        return reply.code(400).send({ ok: false, error: "updateId required" });
      }

      const existing = await getProcessedUpdateById(updateId);
      if (!existing) {
        return reply.code(404).send({ ok: false, error: "Update not found" });
      }

      await enqueueUpdate({
        updateId,
        correlationId: `replay-${updateId}-${Date.now()}`,
      });

      await markProcessedUpdateStatus({
        updateId,
        status: "enqueued",
      });

      return {
        ok: true,
        updateId,
      };
    },
  );

  const updateWorker = createUpdateWorker();
  const agentTurnWorker = createAgentTurnWorker();
  const approvalTimeoutWorker = createApprovalTimeoutWorker();
  const deadLetterWorker = createDeadLetterWorker();

  const registerWorkerLogging = () => {
    const workers = [updateWorker, agentTurnWorker, approvalTimeoutWorker, deadLetterWorker];
    for (const worker of workers) {
      worker.on("failed", (job, error) => {
        logger.error("Worker job failed.", {
          worker: worker.name,
          jobId: job?.id,
          error: String(error),
        });
      });
    }
  };

  const startTelegramRuntime = async () => {
    const bot = getBot();
    if (env.BOT_RUN_MODE === "webhook") {
      const webhookUrl = `${env.APP_BASE_URL}/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;
      try {
        await bot.api.setWebhook(webhookUrl, {
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "callback_query"],
        });
      } catch (error) {
        throwTelegramAuthHint(error);
      }
      logger.info("Webhook mode configured.", { webhookUrl });
      return;
    }

    try {
      await bot.api.deleteWebhook({
        drop_pending_updates: false,
      });
    } catch (error) {
      throwTelegramAuthHint(error);
    }
    await startPollingIngestion();
  };

  let closePromise: Promise<void> | null = null;
  const closeAll = async () => {
    if (!closePromise) {
      closePromise = (async () => {
        try {
          getBot().stop();
        } catch {
          // Ignore stop errors to keep shutdown best-effort.
        }

        await Promise.allSettled([
          app.close(),
          updateWorker.close(),
          agentTurnWorker.close(),
          approvalTimeoutWorker.close(),
          deadLetterWorker.close(),
          redis.quit(),
          sql.end({ timeout: 10 }),
          telemetry.shutdown(),
        ]);
      })();
    }

    await closePromise;
  };

  let isShuttingDown = false;
  const handleSignal = async (signal: "SIGTERM" | "SIGINT") => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    logger.info(`${signal} received. Shutting down.`);
    await closeAll();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void handleSignal("SIGTERM");
  });
  process.on("SIGINT", () => {
    void handleSignal("SIGINT");
  });

  registerWorkerLogging();

  try {
    await startTelegramRuntime();

    const port = Number(process.env.PORT ?? 8787);
    await app.listen({
      host: "0.0.0.0",
      port,
    });

    logger.info("Telegram TON bot service started.", {
      mode: env.BOT_RUN_MODE,
      port,
    });
  } catch (error) {
    await closeAll();
    throw error;
  }
};
