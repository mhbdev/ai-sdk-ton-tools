import { Bot } from "grammy";
import { setTimeout as sleep } from "node:timers/promises";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import type { ChatType } from "@/types/contracts";
import { chunkTelegramMessage } from "@/utils/chunk";

let botInstance: Bot | null = null;
const TELEGRAM_MAX_TEXT_LENGTH = 4096;
const DEFAULT_DRAFT_STEPS = 7;
const DRAFT_STEP_DELAY_MS = 120;
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

const buildDraftFrames = (text: string, stepCount: number) => {
  const frames: string[] = [];
  for (let step = 1; step <= stepCount; step += 1) {
    const end = Math.floor((text.length * step) / stepCount);
    const frame = text.slice(0, end).trim();
    if (frame.length > 0 && frames[frames.length - 1] !== frame) {
      frames.push(frame);
    }
  }
  return frames;
};

export const streamTelegramDraftText = async (
  chatId: string,
  text: string,
  options?: {
    messageThreadId?: number;
    draftSeed?: string;
    chatType?: ChatType;
  },
) => {
  const env = getEnv();
  if (!env.TELEGRAM_ENABLE_STREAM_DRAFTS) {
    return false;
  }

  // Telegram draft streaming is supported in private chats when bot topics mode is enabled.
  if (options?.chatType !== "private") {
    return false;
  }

  if (!(await getBotTopicsModeEnabled())) {
    return false;
  }

  const normalizedText = text.trim();
  if (normalizedText.length === 0 || normalizedText.length > TELEGRAM_MAX_TEXT_LENGTH) {
    return false;
  }

  const numericChatId = Number(chatId);
  const draftId = hashToDraftId(options?.draftSeed ?? `${Date.now()}-${chatId}`);
  const stepCount = Math.min(
    DEFAULT_DRAFT_STEPS,
    Math.max(2, Math.ceil(normalizedText.length / 280)),
  );
  const frames = buildDraftFrames(normalizedText, stepCount);
  if (frames.length < 2) {
    return false;
  }

  try {
    const bot = getBot();
    for (const frame of frames) {
      await bot.api.sendMessageDraft(numericChatId, draftId, frame, {
        ...(typeof options?.messageThreadId === "number"
          ? { message_thread_id: options.messageThreadId }
          : {}),
      });
      await sleep(DRAFT_STEP_DELAY_MS);
    }
    return true;
  } catch (error) {
    logger.warn("Failed to stream Telegram draft updates; falling back to normal send.", {
      error: error instanceof Error ? error.message : String(error),
      chatId,
    });
    return false;
  }
};
