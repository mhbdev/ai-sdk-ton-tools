import {
  agentTurnsQueue,
  approvalCountdownQueue,
  updatesQueue,
} from "@/queue/queues";

const LAG_DEGRADED_THRESHOLD = 1_000;

export const getQueueHealth = async () => {
  const [updateWaiting, agentWaiting, approvalCountdownWaiting] = await Promise.all([
    updatesQueue.getWaitingCount(),
    agentTurnsQueue.getWaitingCount(),
    approvalCountdownQueue.getWaitingCount(),
  ]);

  const lag = updateWaiting + agentWaiting + approvalCountdownWaiting;
  return {
    updateWaiting,
    agentWaiting,
    approvalCountdownWaiting,
    lag,
    degraded: lag > LAG_DEGRADED_THRESHOLD,
  };
};
