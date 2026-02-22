import { agentTurnsQueue, updatesQueue } from "@/queue/queues";

const LAG_DEGRADED_THRESHOLD = 1_000;

export const getQueueHealth = async () => {
  const [updateWaiting, agentWaiting] = await Promise.all([
    updatesQueue.getWaitingCount(),
    agentTurnsQueue.getWaitingCount(),
  ]);

  const lag = updateWaiting + agentWaiting;
  return {
    updateWaiting,
    agentWaiting,
    lag,
    degraded: lag > LAG_DEGRADED_THRESHOLD,
  };
};

