import { Worker } from "bullmq";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";

export const createDeadLetterWorker = () =>
  new Worker(
    "retry-deadletter",
    async (job) => {
      logger.error("Dead-letter event captured.", {
        queue: job.data.queue,
        reason: job.data.reason,
        correlationId: job.data.correlationId,
      });
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
