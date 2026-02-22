import { Bot } from "grammy";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import type { ChatType } from "@/types/contracts";
import { chunkTelegramMessage } from "@/utils/chunk";

let botInstance: Bot | null = null;
const TELEGRAM_MAX_TEXT_LENGTH = 4096;
const DRAFT_STREAM_UPDATE_INTERVAL_MS = 180;
const BOT_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBotTopicsMode:
  | {
      enabled: boolean;
      expiresAt: number;
    }
  | null = null;

export const getBot = () => {
  if (botInstance) {
    return botInstance;
  }

  const env = getEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  bot.catch((error) => {
    logger.error("Unhandled grammY error.", { error: String(error.error) });
  });
  botInstance = bot;
  return bot;
};

const getBotTopicsModeEnabled = async () => {
  if (cachedBotTopicsMode && cachedBotTopicsMode.expiresAt > Date.now()) {
    return cachedBotTopicsMode.enabled;
  }

  try {
    const me = await getBot().api.getMe();
    const enabled = Boolean(
      (me as unknown as { has_topics_enabled?: boolean }).has_topics_enabled,
    );
    cachedBotTopicsMode = {
      enabled,
      expiresAt: Date.now() + BOT_PROFILE_CACHE_TTL_MS,
    };
    return enabled;
  } catch (error) {
    logger.warn("Failed to read bot profile for topics mode capability.", {
      error: error instanceof Error ? error.message : String(error),
    });
    cachedBotTopicsMode = {
      enabled: false,
      expiresAt: Date.now() + BOT_PROFILE_CACHE_TTL_MS,
    };
    return false;
  }
};

export const botSupportsTopicsMode = () => getBotTopicsModeEnabled();

export const sendTelegramText = async (
  chatId: string,
  text: string,
  options?: {
    messageThreadId?: number;
  },
) => {
  const bot = getBot();
  const numericChatId = Number(chatId);
  for (const chunk of chunkTelegramMessage(text)) {
    await bot.api.sendMessage(numericChatId, chunk, {
      ...(typeof options?.messageThreadId === "number"
        ? { message_thread_id: options.messageThreadId }
        : {}),
    });
  }
};

const hashToDraftId = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  const normalized = Math.abs(hash) % 2_147_483_647;
  return normalized === 0 ? 1 : normalized;
};

type TelegramDraftStreamSession = {
  pushDelta: (delta: string) => void;
  finish: (finalText?: string) => Promise<boolean>;
};

const createNoopDraftSession = (): TelegramDraftStreamSession => ({
  pushDelta: () => undefined,
  finish: async () => false,
});

export const createTelegramTokenDraftStream = async (
  chatId: string,
  options?: {
    messageThreadId?: number;
    draftSeed?: string;
    chatType?: ChatType;
  },
): Promise<TelegramDraftStreamSession> => {
  const env = getEnv();
  if (!env.TELEGRAM_ENABLE_STREAM_DRAFTS) {
    return createNoopDraftSession();
  }

  // Telegram draft streaming is supported in private chats when bot topics mode is enabled.
  if (options?.chatType !== "private") {
    return createNoopDraftSession();
  }

  if (!(await getBotTopicsModeEnabled())) {
    return createNoopDraftSession();
  }

  const bot = getBot();
  const numericChatId = Number(chatId);
  const draftId = hashToDraftId(options?.draftSeed ?? `${Date.now()}-${chatId}`);
  let bufferedText = "";
  let lastSentText = "";
  let lastSentAt = 0;
  let failed = false;
  let flushTimer: NodeJS.Timeout | null = null;
  let sendChain: Promise<void> = Promise.resolve();

  const queueSend = () => {
    if (failed) {
      return;
    }

    const snapshot = bufferedText.trimEnd();
    if (snapshot.length === 0 || snapshot.length > TELEGRAM_MAX_TEXT_LENGTH) {
      return;
    }
    if (snapshot === lastSentText) {
      return;
    }

    sendChain = sendChain
      .then(async () => {
        await bot.api.sendMessageDraft(numericChatId, draftId, snapshot, {
          ...(typeof options?.messageThreadId === "number"
            ? { message_thread_id: options.messageThreadId }
            : {}),
        });
        lastSentText = snapshot;
        lastSentAt = Date.now();
      })
      .catch((error) => {
        failed = true;
        logger.warn("Failed to stream Telegram token draft; continuing without live draft.", {
          error: error instanceof Error ? error.message : String(error),
          chatId,
        });
      });
  };

  const clearFlushTimer = () => {
    if (!flushTimer) {
      return;
    }
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const scheduleFlush = () => {
    if (failed || flushTimer) {
      return;
    }

    const elapsed = Date.now() - lastSentAt;
    const delay = Math.max(0, DRAFT_STREAM_UPDATE_INTERVAL_MS - elapsed);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      queueSend();
    }, delay);
  };

  return {
    pushDelta: (delta: string) => {
      if (failed || typeof delta !== "string" || delta.length === 0) {
        return;
      }

      bufferedText += delta;
      if (Date.now() - lastSentAt >= DRAFT_STREAM_UPDATE_INTERVAL_MS) {
        queueSend();
        return;
      }
      scheduleFlush();
    },
    finish: async (finalText?: string) => {
      if (typeof finalText === "string" && finalText.trim().length > 0) {
        bufferedText = finalText;
      }
      clearFlushTimer();
      queueSend();
      await sendChain;
      return !failed && lastSentText.length > 0;
    },
  };
};
