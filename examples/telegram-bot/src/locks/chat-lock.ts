import { setTimeout as sleep } from "node:timers/promises";
import { redis } from "@/queue/connection";

const LOCK_TTL_MS = 15_000;
const LOCK_RETRY_MAX = 20;
const LOCK_RETRY_DELAY_MS = 120;

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

  const heartbeat = setInterval(async () => {
    const current = await redis.get(key);
    if (current === lockToken) {
      await redis.pexpire(key, LOCK_TTL_MS);
    }
  }, 5_000);

  try {
    return await work();
  } finally {
    clearInterval(heartbeat);
    const current = await redis.get(key);
    if (current === lockToken) {
      await redis.del(key);
    }
  }
};
