import { setTimeout as sleep } from "node:timers/promises";
import Fastify from "fastify";
import { GrammyError } from "grammy";
import type { TelemetryHandle } from "@/observability/telemetry";
import { getBot } from "@/telegram/bot";
import { getEnv } from "@/config/env";
import { assertDatabaseSchemaCompatibility } from "@/db/schema-compat";
import { getQueueHealth } from "@/queue/health";
import { markProcessedUpdateStatus, getProcessedUpdateById } from "@/db/queries";
import { sql } from "@/db/client";
import { logger } from "@/observability/logger";
import { redis } from "@/queue/connection";
import { enqueueUpdate } from "@/queue/queues";
import {
  createAgentTurnWorker,
  createApprovalCountdownWorker,
  createApprovalTimeoutWorker,
  createDeadLetterWorker,
  createUpdateWorker,
} from "@/jobs";
import { startPollingIngestion } from "@/telegram/polling";
import { registerWebhookRoute } from "@/telegram/webhook";
import { verifyAdminBearerToken } from "@/security/webhook-auth";
import { shutdownWalletConnectFlows } from "@/wallet/tonconnect";

type StartRuntimeArgs = {
  telemetry: TelemetryHandle;
};

const TELEGRAM_BOOTSTRAP_MAX_ATTEMPTS = 8;
const TELEGRAM_BOOTSTRAP_RETRY_BASE_DELAY_MS = 750;

const isTransientTelegramNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /network request/i.test(message) ||
    /fetch failed/i.test(message) ||
    /timeout/i.test(message) ||
    /econn/i.test(message) ||
    /und_err/i.test(message)
  );
};

const retryTelegramBootstrap = async <T>(input: {
  label: string;
  run: () => Promise<T>;
}) => {
  let attempt = 1;
  while (attempt <= TELEGRAM_BOOTSTRAP_MAX_ATTEMPTS) {
    try {
      return await input.run();
    } catch (error) {
      if (
        !isTransientTelegramNetworkError(error) ||
        attempt >= TELEGRAM_BOOTSTRAP_MAX_ATTEMPTS
      ) {
        throw error;
      }

      const delayMs = TELEGRAM_BOOTSTRAP_RETRY_BASE_DELAY_MS * attempt;
      logger.warn("Telegram bootstrap request failed, retrying.", {
        label: input.label,
        attempt,
        maxAttempts: TELEGRAM_BOOTSTRAP_MAX_ATTEMPTS,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
      attempt += 1;
    }
  }
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
  await assertDatabaseSchemaCompatibility();
  const normalizedAppBaseUrl = env.APP_BASE_URL.endsWith("/")
    ? env.APP_BASE_URL
    : `${env.APP_BASE_URL}/`;
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
  const approvalCountdownWorker = createApprovalCountdownWorker();
  const approvalTimeoutWorker = createApprovalTimeoutWorker();
  const deadLetterWorker = createDeadLetterWorker();

  const registerWorkerLogging = () => {
    const workers = [
      updateWorker,
      agentTurnWorker,
      approvalCountdownWorker,
      approvalTimeoutWorker,
      deadLetterWorker,
    ];
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
      const webhookUrl = new URL("telegram/webhook", normalizedAppBaseUrl).toString();
      try {
        await retryTelegramBootstrap({
          label: "setWebhook",
          run: () =>
            bot.api.setWebhook(webhookUrl, {
              secret_token: env.TELEGRAM_WEBHOOK_SECRET,
              allowed_updates: ["message", "callback_query"],
            }),
        });
      } catch (error) {
        throwTelegramAuthHint(error);
      }
      let webhookInfo:
        | {
            url: string;
            pendingUpdateCount: number;
            lastErrorDate: number | null;
            lastErrorMessage: string | null;
            maxConnections: number | null;
          }
        | undefined;
      try {
        webhookInfo = await retryTelegramBootstrap({
          label: "getWebhookInfo",
          run: async () => {
            const result = await bot.api.getWebhookInfo();
            return {
              url: result.url ?? "",
              pendingUpdateCount: result.pending_update_count,
              lastErrorDate: result.last_error_date ?? null,
              lastErrorMessage: result.last_error_message ?? null,
              maxConnections: result.max_connections ?? null,
            };
          },
        });
      } catch (error) {
        logger.warn("Failed to fetch webhook info after setWebhook.", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.info("Webhook mode configured.", {
        webhookUrl,
        webhookInfo,
      });
      return;
    }

    try {
      await retryTelegramBootstrap({
        label: "deleteWebhook",
        run: () =>
          bot.api.deleteWebhook({
            drop_pending_updates: false,
          }),
      });
    } catch (error) {
      if (!isTransientTelegramNetworkError(error)) {
        throwTelegramAuthHint(error);
      }
      logger.warn("deleteWebhook failed after retries; starting polling anyway.", {
        error: error instanceof Error ? error.message : String(error),
      });
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

        await shutdownWalletConnectFlows().catch((error) => {
          logger.warn("Failed to shutdown pending TonConnect flows cleanly.", {
            error: error instanceof Error ? error.message : String(error),
          });
        });

        await Promise.allSettled([
          app.close(),
          updateWorker.close(),
          agentTurnWorker.close(),
          approvalCountdownWorker.close(),
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
