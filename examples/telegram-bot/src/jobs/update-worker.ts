import type { Update } from "grammy/types";
import { Worker } from "bullmq";
import { markProcessedUpdateStatus, getProcessedUpdateById } from "@/db/queries";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { deadLetterQueue, enqueueAgentTurn } from "@/queue/queues";
import { getBot } from "@/telegram/bot";
import { routeUpdate } from "@/telegram/router";

export const createUpdateWorker = () =>
  new Worker(
    "updates",
    async (job) => {
      const updateRecord = await getProcessedUpdateById(job.data.updateId);
      if (!updateRecord) {
        logger.warn("Update record missing.", { updateId: job.data.updateId });
        return;
      }

      const update = updateRecord.rawUpdateJson as Update;
      try {
        const result = await routeUpdate(update);
        if (result.shouldQueueTurn && result.turnRequest) {
          await enqueueAgentTurn(result.turnRequest);
        }

        if (update.callback_query?.id) {
          const bot = getBot();
          await bot.api.answerCallbackQuery(update.callback_query.id);
        }

        await markProcessedUpdateStatus({
          updateId: job.data.updateId,
          status: "processed",
        });
      } catch (error) {
        await markProcessedUpdateStatus({
          updateId: job.data.updateId,
          status: "failed",
          error: (error as Error).message,
        });
        await deadLetterQueue.add("deadletter-update" as const, {
          queue: "updates",
          payload: job.data,
          reason: (error as Error).message,
          correlationId: job.data.correlationId,
        });
        throw error;
      }
    },
    {
      connection: bullConnection,
      concurrency: 20,
    },
  );
