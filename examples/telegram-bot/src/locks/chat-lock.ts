import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "@/observability/logger";
import { redis } from "@/queue/connection";

// Agent turns can take tens of seconds when tool calls and approvals are involved.
// Keep lock ownership long enough and wait patiently for in-chat serialization.
const LOCK_TTL_MS = 90_000;
const LOCK_RETRY_MAX = 60;
const LOCK_RETRY_DELAY_MS = 250;

const lockKeyForConversation = (chatId: string, messageThreadId?: number) =>
  typeof messageThreadId === "number"
    ? `chat:${chatId}:thread:${messageThreadId}:lock`
    : `chat:${chatId}:lock`;

export const withChatLock = async <T>(
  chatId: string,
  messageThreadId: number | undefined,
  work: () => Promise<T>,
) => {
  const key = lockKeyForConversation(chatId, messageThreadId);
  let lockToken = "";

  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt += 1) {
    const token = `${Date.now()}-${Math.random()}`;
    const acquired = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (acquired === "OK") {
      lockToken = token;
      break;
    }
    await sleep(LOCK_RETRY_DELAY_MS);
  }

  if (!lockToken) {
    throw new Error(
      `Unable to acquire chat lock for chat ${chatId}${typeof messageThreadId === "number" ? ` thread ${messageThreadId}` : ""}`,
    );
  }

  let heartbeatFailed = false;
  const renewLock = async () => {
    try {
      const current = await redis.get(key);
      if (current === lockToken) {
        await redis.pexpire(key, LOCK_TTL_MS);
      }
      heartbeatFailed = false;
    } catch (error) {
      if (heartbeatFailed) {
        return;
      }
      heartbeatFailed = true;
      logger.warn("Chat lock heartbeat failed; continuing without renewal.", {
        chatId,
        messageThreadId: typeof messageThreadId === "number" ? messageThreadId : null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const heartbeat = setInterval(() => {
    void renewLock();
  }, 10_000);

  try {
    return await work();
  } finally {
    clearInterval(heartbeat);
    try {
      const current = await redis.get(key);
      if (current === lockToken) {
        await redis.del(key);
      }
    } catch (error) {
      logger.warn("Chat lock release failed; lock may expire by TTL.", {
        chatId,
        messageThreadId: typeof messageThreadId === "number" ? messageThreadId : null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
