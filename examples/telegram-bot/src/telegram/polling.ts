import { setTimeout as sleep } from "node:timers/promises";
import { GrammyError } from "grammy";
import { logger } from "@/observability/logger";
import { markProcessedUpdateStatus, tryInsertProcessedUpdate } from "@/db/queries";
import { enqueueUpdate } from "@/queue/queues";
import { getBot } from "@/telegram/bot";
import { getEnv } from "@/config/env";

const POLLING_START_MAX_ATTEMPTS = 8;
const POLLING_START_RETRY_BASE_DELAY_MS = 750;
let ingestionMiddlewareRegistered = false;

const isTransientPollingStartError = (error: unknown) => {
  if (error instanceof GrammyError) {
    if (error.error_code >= 500) {
      return true;
    }

    if (error.error_code === 429) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    /network request/i.test(message) ||
    /fetch failed/i.test(message) ||
    /timeout/i.test(message) ||
    /econn/i.test(message) ||
    /etimedout/i.test(message) ||
    /eai_again/i.test(message) ||
    /socket hang up/i.test(message) ||
    /und_err/i.test(message)
  );
};

export const startPollingIngestion = async () => {
  const bot = getBot();
  const env = getEnv();

  if (!ingestionMiddlewareRegistered) {
    bot.use(async (ctx, next) => {
      const update = ctx.update;
      if (typeof update.update_id !== "number") {
        await next();
        return;
      }

      const inserted = await tryInsertProcessedUpdate({
        updateId: update.update_id,
        rawUpdateJson: update,
      });

      if (!inserted.inserted) {
        return;
      }

      await enqueueUpdate({
        updateId: update.update_id,
        correlationId: `update-${update.update_id}`,
      });

      await markProcessedUpdateStatus({
        updateId: update.update_id,
        status: "enqueued",
      });

      await next();
    });

    ingestionMiddlewareRegistered = true;
  }

  let attempt = 1;
  while (attempt <= POLLING_START_MAX_ATTEMPTS) {
    try {
      await bot.start({
        timeout: env.TELEGRAM_POLLING_TIMEOUT_SECONDS,
        limit: env.TELEGRAM_POLLING_LIMIT,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
        onStart: () => {
          logger.info("Telegram polling started.", {
            timeoutSeconds: env.TELEGRAM_POLLING_TIMEOUT_SECONDS,
            limit: env.TELEGRAM_POLLING_LIMIT,
          });
        },
      });
      return;
    } catch (error) {
      if (!isTransientPollingStartError(error) || attempt >= POLLING_START_MAX_ATTEMPTS) {
        throw error;
      }

      const delayMs = POLLING_START_RETRY_BASE_DELAY_MS * attempt;
      logger.warn("Telegram polling start failed, retrying.", {
        attempt,
        maxAttempts: POLLING_START_MAX_ATTEMPTS,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      attempt += 1;
      await sleep(delayMs);
    }
  }
};
