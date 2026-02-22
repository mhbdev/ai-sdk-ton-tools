import Fastify from "fastify";
import { getBot } from "@/telegram/bot";
import { getEnv } from "@/config/env";
import { getQueueHealth } from "@/queue/health";
import { markProcessedUpdateStatus, getProcessedUpdateById } from "@/db/queries";
import { sql } from "@/db/client";
import { logger } from "@/observability/logger";
import { initTelemetry } from "@/observability/telemetry";
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

const env = getEnv();
initTelemetry();

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
    await bot.api.setWebhook(webhookUrl, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });
    logger.info("Webhook mode configured.", { webhookUrl });
    return;
  }

  await bot.api.deleteWebhook({
    drop_pending_updates: false,
  });
  await startPollingIngestion();
};

const closeAll = async () => {
  await Promise.allSettled([
    updateWorker.close(),
    agentTurnWorker.close(),
    approvalTimeoutWorker.close(),
    deadLetterWorker.close(),
    redis.quit(),
    sql.end({ timeout: 10 }),
  ]);
};

const boot = async () => {
  registerWorkerLogging();
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
};

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received. Shutting down.");
  await closeAll();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received. Shutting down.");
  await closeAll();
  process.exit(0);
});

boot().catch(async (error) => {
  logger.error("Fatal startup error.", { error: String(error) });
  await closeAll();
  process.exit(1);
});

