import { setTimeout as sleep } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify from "fastify";
import { GrammyError } from "grammy";
import type { TelemetryHandle } from "@/observability/telemetry";
import { getBot } from "@/telegram/bot";
import { getEnv } from "@/config/env";
import {
  assertDatabaseSchemaCompatibility,
  repairDatabaseSchemaCompatibility,
} from "@/db/schema-compat";
import { getQueueHealth } from "@/queue/health";
import {
  markProcessedUpdateStatus,
  getProcessedUpdateById,
  listReceivedUpdatesForEnqueueRecovery,
} from "@/db/queries";
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
const RECEIVED_UPDATE_RECOVERY_INTERVAL_MS = 5_000;
const RECEIVED_UPDATE_RECOVERY_BATCH_SIZE = 200;
const TONCONNECT_ICON_DEFAULT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAR0lEQVR42u3PQQ0AIAzAMMC/5yFjRxMFPXp2zQAAAPBf1S0W2gV2mQkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4F8M6vQBAzQ2m0QAAAAASUVORK5CYII=";
const TONCONNECT_ICON_PATH_SEGMENTS = ["public", "tonconnect-icon.png"] as const;
const TONCONNECT_OPEN_ALLOWED_PROTOCOLS = new Set([
  "tc:",
  "ton:",
  "tonkeeper:",
  "tonhub:",
]);

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

const loadTonConnectIconPng = async () => {
  const iconPath = resolve(process.cwd(), ...TONCONNECT_ICON_PATH_SEGMENTS);
  try {
    return await readFile(iconPath);
  } catch (error) {
    logger.warn("TonConnect icon file not found; using embedded fallback.", {
      iconPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return Buffer.from(TONCONNECT_ICON_DEFAULT_PNG_BASE64, "base64");
  }
};

const escapeHtml = (input: string) =>
  input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const startRuntime = async ({ telemetry }: StartRuntimeArgs) => {
  const env = getEnv();
  await repairDatabaseSchemaCompatibility();
  await assertDatabaseSchemaCompatibility();
  const normalizedAppBaseUrl = env.APP_BASE_URL.endsWith("/")
    ? env.APP_BASE_URL
    : `${env.APP_BASE_URL}/`;
  const tonConnectManifestUrl = new URL(
    "tonconnect-manifest.json",
    normalizedAppBaseUrl,
  ).toString();
  const tonConnectIconUrl = new URL("tonconnect-icon.png", normalizedAppBaseUrl).toString();
  const tonConnectIconPng = await loadTonConnectIconPng();
  const app = Fastify({
    logger: false,
  });

  registerWebhookRoute(app);

  app.get("/tonconnect-icon.png", async (_request, reply) => {
    return reply
      .header("content-type", "image/png")
      .header("cache-control", "public, max-age=86400")
      .send(tonConnectIconPng);
  });

  app.get("/tonconnect-manifest.json", async () => ({
    name: "Telegram TON Agent Bot",
    url: normalizedAppBaseUrl.endsWith("/")
      ? normalizedAppBaseUrl.slice(0, -1)
      : normalizedAppBaseUrl,
    iconUrl: tonConnectIconUrl,
  }));

  app.get<{ Querystring: { target?: string } }>(
    "/tonconnect/open",
    async (request, reply) => {
      const target = request.query.target;
      if (typeof target !== "string" || target.length === 0) {
        return reply.code(400).send({
          ok: false,
          error: "target query parameter is required",
        });
      }

      let parsedTarget: URL;
      try {
        parsedTarget = new URL(target);
      } catch {
        return reply.code(400).send({
          ok: false,
          error: "target must be a valid URL",
        });
      }

      if (!TONCONNECT_OPEN_ALLOWED_PROTOCOLS.has(parsedTarget.protocol)) {
        return reply.code(400).send({
          ok: false,
          error: "target URL protocol is not allowed",
        });
      }

      const safeTarget = parsedTarget.toString();
      const escapedTarget = escapeHtml(safeTarget);
      const html = [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        "<title>Open Wallet</title>",
        "<style>",
        "body{font-family:Arial,sans-serif;margin:0;padding:24px;background:#f7f8fb;color:#0f172a;}",
        ".card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;}",
        "a.btn{display:inline-block;margin-top:12px;padding:10px 14px;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;}",
        "code{word-break:break-all;background:#f1f5f9;padding:2px 4px;border-radius:4px;}",
        "</style>",
        "</head>",
        "<body>",
        "<div class=\"card\">",
        "<h1>Opening wallet app...</h1>",
        "<p>If your wallet does not open automatically, tap the button below.</p>",
        `<a class="btn" href="${escapedTarget}" rel="noopener noreferrer">Open Wallet App</a>`,
        `<p style="margin-top:16px;font-size:13px;color:#475569;">Link: <code>${escapedTarget}</code></p>`,
        "</div>",
        "<script>",
        `const target = ${JSON.stringify(safeTarget)};`,
        "setTimeout(() => { window.location.href = target; }, 50);",
        "</script>",
        "</body>",
        "</html>",
      ].join("");

      return reply
        .header("cache-control", "no-store")
        .type("text/html; charset=utf-8")
        .send(html);
    },
  );

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
  let receivedUpdateRecoveryTimer: ReturnType<typeof setInterval> | null = null;
  let receivedUpdateRecoveryInFlight = false;

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (
          worker.name === "agent-turns" &&
          /Unable to acquire chat lock for chat/i.test(errorMessage)
        ) {
          logger.warn("Agent turn deferred due to chat lock contention.", {
            worker: worker.name,
            jobId: job?.id,
            attemptsMade: job?.attemptsMade,
            maxAttempts: job?.opts.attempts,
            error: errorMessage,
          });
          return;
        }

        logger.error("Worker job failed.", {
          worker: worker.name,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          maxAttempts: job?.opts.attempts,
          error: errorMessage,
        });
      });
    }
  };

  const recoverReceivedUpdates = async () => {
    if (receivedUpdateRecoveryInFlight) {
      return;
    }
    receivedUpdateRecoveryInFlight = true;
    try {
      const pendingUpdates = await listReceivedUpdatesForEnqueueRecovery(
        RECEIVED_UPDATE_RECOVERY_BATCH_SIZE,
      );
      if (pendingUpdates.length === 0) {
        return;
      }

      logger.warn("Attempting recovery for persisted updates waiting on queue enqueue.", {
        pendingCount: pendingUpdates.length,
      });

      for (const pendingUpdate of pendingUpdates) {
        const updateId = Number(pendingUpdate.telegramUpdateId);
        if (!Number.isInteger(updateId)) {
          logger.error("Skipping invalid update id during enqueue recovery.", {
            telegramUpdateId: pendingUpdate.telegramUpdateId,
          });
          continue;
        }

        try {
          await enqueueUpdate({
            updateId,
            correlationId: `recover-${updateId}-${Date.now()}`,
          });
          await markProcessedUpdateStatus({
            updateId,
            status: "enqueued",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn("Enqueue recovery attempt failed; will retry.", {
            updateId,
            error: message,
          });
          await markProcessedUpdateStatus({
            updateId,
            status: "received",
            error: message,
          }).catch(() => undefined);
        }
      }
    } catch (error) {
      logger.warn("Received update recovery loop failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      receivedUpdateRecoveryInFlight = false;
    }
  };

  const startTelegramRuntime = async () => {
    const bot = getBot();
    if (env.TONCONNECT_MANIFEST_URL !== tonConnectManifestUrl) {
      logger.warn("TONCONNECT_MANIFEST_URL is not using built-in manifest route.", {
        configuredManifestUrl: env.TONCONNECT_MANIFEST_URL,
        recommendedManifestUrl: tonConnectManifestUrl,
      });
    }

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

        if (receivedUpdateRecoveryTimer) {
          clearInterval(receivedUpdateRecoveryTimer);
          receivedUpdateRecoveryTimer = null;
        }

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
    await recoverReceivedUpdates();
    receivedUpdateRecoveryTimer = setInterval(() => {
      void recoverReceivedUpdates();
    }, RECEIVED_UPDATE_RECOVERY_INTERVAL_MS);

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
