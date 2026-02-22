import { logger } from "@/observability/logger";
import { markProcessedUpdateStatus, tryInsertProcessedUpdate } from "@/db/queries";
import { enqueueUpdate } from "@/queue/queues";
import { getBot } from "@/telegram/bot";

export const startPollingIngestion = async () => {
  const bot = getBot();

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

  await bot.start({
    onStart: () => {
      logger.info("Telegram polling started.");
    },
  });
};

