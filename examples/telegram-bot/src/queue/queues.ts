import { Queue } from "bullmq";
import { bullConnection } from "@/queue/connection";
import type { BotUpdateJob, QueueName, TurnExecutionRequest } from "@/types/contracts";

const defaultJobOptions = {
  removeOnComplete: 500,
  removeOnFail: 1000,
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 1_000,
  },
};

export const updatesQueue = new Queue<BotUpdateJob, void, string>("updates", {
  connection: bullConnection,
  defaultJobOptions,
});

export const agentTurnsQueue = new Queue<TurnExecutionRequest, void, string>("agent-turns", {
  connection: bullConnection,
  defaultJobOptions,
});

export const approvalTimeoutQueue = new Queue<{
  approvalId: string;
  correlationId: string;
}, void, string>("approval-timeouts", {
  connection: bullConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 1,
  },
});

export const approvalCountdownQueue = new Queue<{
  approvalId: string;
  correlationId: string;
}, void, string>("approval-countdowns", {
  connection: bullConnection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 1,
  },
});

export const deadLetterQueue = new Queue<{
  queue: QueueName;
  payload: unknown;
  reason: string;
  correlationId: string;
}, void, string>("retry-deadletter", {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: 5_000,
    removeOnFail: 10_000,
  },
});

export const enqueueUpdate = async (data: BotUpdateJob) =>
  updatesQueue.add("process-update" as const, data, {
    // BullMQ rejects custom job IDs that contain ":".
    jobId: `update-${data.updateId}`,
  });

export const enqueueAgentTurn = async (data: TurnExecutionRequest) =>
  agentTurnsQueue.add("execute-turn" as const, data, {
    jobId: `turn-${data.correlationId}`,
  });

export const enqueueApprovalTimeout = async (input: {
  approvalId: string;
  correlationId: string;
  delayMs: number;
}) =>
  approvalTimeoutQueue.add(
    "expire-approval" as const,
    {
      approvalId: input.approvalId,
      correlationId: input.correlationId,
    },
    {
      delay: input.delayMs,
      jobId: `approval-expire-${input.approvalId}`,
      attempts: 1,
    },
  );

export const enqueueApprovalCountdown = async (input: {
  approvalId: string;
  correlationId: string;
  delayMs: number;
}) =>
  approvalCountdownQueue.add(
    "refresh-approval-card" as const,
    {
      approvalId: input.approvalId,
      correlationId: input.correlationId,
    },
    {
      delay: input.delayMs,
      jobId: `approval-refresh-${input.approvalId}-${Date.now()}`,
      attempts: 1,
    },
  );
