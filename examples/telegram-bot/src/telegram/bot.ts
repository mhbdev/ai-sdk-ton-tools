import { Bot } from "grammy";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import {
  hasLikelyMarkdownFormatting,
  isTelegramParseModeError,
  renderTelegramHtmlFromMarkdown,
} from "@/telegram/format";
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

export const isTelegramMessageThreadNotFoundError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /message thread not found/i.test(message);
};

type SendMessageOptions = {
  message_thread_id?: number;
  reply_parameters?: {
    message_id: number;
    allow_sending_without_reply?: boolean;
  };
  parse_mode?: "HTML";
};

const sendMessageWithThreadFallback = async (
  bot: Bot,
  chatId: number,
  text: string,
  options: SendMessageOptions,
) => {
  try {
    await bot.api.sendMessage(chatId, text, options);
  } catch (error) {
    if (!isTelegramMessageThreadNotFoundError(error) || options.message_thread_id === undefined) {
      throw error;
    }

    logger.warn("Telegram thread not found; retrying send in main chat context.", {
      chatId: String(chatId),
      error: error instanceof Error ? error.message : String(error),
    });

    const fallbackOptions: SendMessageOptions = {
      ...(typeof options.parse_mode === "string" ? { parse_mode: options.parse_mode } : {}),
    };
    await bot.api.sendMessage(chatId, text, fallbackOptions);
  }
};

export const sendTelegramText = async (
  chatId: string,
  text: string,
  options?: {
    messageThreadId?: number;
    replyToMessageId?: number;
  },
) => {
  const bot = getBot();
  const numericChatId = Number(chatId);
  const shouldTryRichFormatting = hasLikelyMarkdownFormatting(text);
  const maxChunkSize = shouldTryRichFormatting ? 3500 : 4096;

  for (const chunk of chunkTelegramMessage(text, maxChunkSize)) {
    const baseOptions = {
      ...(typeof options?.messageThreadId === "number"
        ? { message_thread_id: options.messageThreadId }
        : {}),
      ...(typeof options?.replyToMessageId === "number"
        ? {
            reply_parameters: {
              message_id: options.replyToMessageId,
              allow_sending_without_reply: true,
            },
          }
        : {}),
    };

    if (!shouldTryRichFormatting) {
      await sendMessageWithThreadFallback(
        bot,
        numericChatId,
        chunk,
        baseOptions,
      );
      continue;
    }

    const htmlChunk = renderTelegramHtmlFromMarkdown(chunk);
    try {
      await sendMessageWithThreadFallback(bot, numericChatId, htmlChunk, {
        ...baseOptions,
        parse_mode: "HTML",
      });
    } catch (error) {
      if (!isTelegramParseModeError(error)) {
        throw error;
      }

      logger.warn("Telegram parse mode failed; falling back to plain text.", {
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
      await sendMessageWithThreadFallback(
        bot,
        numericChatId,
        chunk,
        baseOptions,
      );
    }
  }
};

export const editTelegramText = async (input: {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup?: unknown | null;
}) => {
  try {
    const bot = getBot();
    if ("replyMarkup" in input) {
      const editOptions = {
        reply_markup:
          input.replyMarkup === null
            ? { inline_keyboard: [] }
            : input.replyMarkup,
      };
      await bot.api.editMessageText(
        Number(input.chatId),
        input.messageId,
        input.text,
        editOptions as never,
      );
    } else {
      await bot.api.editMessageText(
        Number(input.chatId),
        input.messageId,
        input.text,
      );
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/message is not modified/i.test(message)) {
      return false;
    }
    logger.warn("Failed to edit Telegram message.", {
      chatId: input.chatId,
      messageId: input.messageId,
      error: message,
    });
    return false;
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
  let lastDispatchAt = 0;
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
    lastDispatchAt = Date.now();

    sendChain = sendChain
      .then(async () => {
        await bot.api.sendMessageDraft(numericChatId, draftId, snapshot, {
          ...(typeof options?.messageThreadId === "number"
            ? { message_thread_id: options.messageThreadId }
            : {}),
        });
        lastSentText = snapshot;
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

    const elapsed = Date.now() - lastDispatchAt;
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
      if (Date.now() - lastDispatchAt >= DRAFT_STREAM_UPDATE_INTERVAL_MS) {
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
