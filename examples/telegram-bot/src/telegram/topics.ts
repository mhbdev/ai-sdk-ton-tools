import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";
import { botSupportsTopicsMode, getBot, sendTelegramText } from "@/telegram/bot";
import type { ChatType } from "@/types/contracts";

const MAX_TOPIC_TITLE_LENGTH = 64;
const FORUM_ICON_CACHE_TTL_MS = 10 * 60 * 1000;
const TOPIC_CREATE_RETRY_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_EMOJI = "💬";
const TOPIC_SUPPORTED_CHAT_TYPES = new Set<ChatType>(["private", "supergroup"]);

const TOPIC_EMOJI_CHOICES = [
  "💬",
  "🤖",
  "📈",
  "💸",
  "🔒",
  "🧪",
  "🧩",
  "⚙️",
  "📊",
  "🛡️",
] as const;

const topicNameSchema = z.object({
  title: z.string().min(3).max(MAX_TOPIC_TITLE_LENGTH),
  emoji: z.string().min(1).max(8),
});

type TopicSuggestion = {
  title: string;
  emoji: string;
  source: "llm" | "heuristic";
};

type TopicCreationResult = {
  messageThreadId?: number;
  created: boolean;
  title?: string;
  emoji?: string;
  source?: "llm" | "heuristic";
};

let cachedOpenRouter: ReturnType<typeof createOpenRouter> | null = null;
let cachedForumIcons:
  | {
      expiresAt: number;
      emojiToCustomId: Map<string, string>;
    }
  | null = null;
const topicCreateBackoffByChat = new Map<string, number>();

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .trim();

const sanitizeTitle = (value: string) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "TON Discussion";
  }

  if (normalized.length <= MAX_TOPIC_TITLE_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, MAX_TOPIC_TITLE_LENGTH - 1).trimEnd();
};

const fallbackTitleFromPrompt = (prompt: string) => {
  const normalized = normalizeWhitespace(prompt)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}\s:;,.!?-]+/gu, "");
  if (!normalized) {
    return "TON Discussion";
  }

  const words = normalized.split(" ").filter(Boolean).slice(0, 7);
  const candidate = words.join(" ");
  const title = candidate.length > 0 ? candidate : "TON Discussion";
  return sanitizeTitle(title);
};

const fallbackEmojiFromPrompt = (prompt: string) => {
  const lowered = prompt.toLowerCase();
  if (/(swap|trade|dex|stonfi|price|rate)/.test(lowered)) {
    return "📈";
  }
  if (/(wallet|connect|address|send|transfer)/.test(lowered)) {
    return "💸";
  }
  if (/(security|safe|secure|seed|mnemonic|private key|proof)/.test(lowered)) {
    return "🔒";
  }
  if (/(debug|error|test|qa|bug)/.test(lowered)) {
    return "🧪";
  }
  if (/(nft|jetton|token)/.test(lowered)) {
    return "🧩";
  }
  return DEFAULT_EMOJI;
};

const toSupportedEmoji = (emojiCandidate: string, prompt: string) => {
  const normalized = emojiCandidate.trim();
  if (TOPIC_EMOJI_CHOICES.includes(normalized as (typeof TOPIC_EMOJI_CHOICES)[number])) {
    return normalized;
  }
  return fallbackEmojiFromPrompt(prompt);
};

const getOpenRouter = () => {
  if (!cachedOpenRouter) {
    cachedOpenRouter = createOpenRouter({
      apiKey: getEnv().OPENROUTER_API_KEY,
    });
  }
  return cachedOpenRouter;
};

const suggestTopicWithLlm = async (prompt: string): Promise<TopicSuggestion> => {
  const env = getEnv();
  const { object } = await generateObject({
    model: getOpenRouter()(env.AI_TOPIC_MODEL),
    schema: topicNameSchema,
    temperature: 0.2,
    maxOutputTokens: 80,
    prompt: [
      "Create a concise Telegram forum topic title and one emoji for this user request.",
      "Rules:",
      "- title must be short, specific, plain text, <= 64 chars",
      `- emoji must be one of: ${TOPIC_EMOJI_CHOICES.join(", ")}`,
      "- no markdown",
      "",
      `User request: ${prompt}`,
    ].join("\n"),
  });

  return {
    title: sanitizeTitle(object.title),
    emoji: toSupportedEmoji(object.emoji, prompt),
    source: "llm",
  };
};

const suggestTopic = async (prompt: string): Promise<TopicSuggestion> => {
  const normalizedPrompt = normalizeWhitespace(prompt);
  const heuristic: TopicSuggestion = {
    title: fallbackTitleFromPrompt(normalizedPrompt),
    emoji: fallbackEmojiFromPrompt(normalizedPrompt),
    source: "heuristic",
  };

  try {
    const llm = await suggestTopicWithLlm(normalizedPrompt);
    return llm;
  } catch (error) {
    logger.warn("Topic naming model failed; using heuristic fallback.", {
      error: error instanceof Error ? error.message : String(error),
      modelId: getEnv().AI_TOPIC_MODEL,
    });
    return heuristic;
  }
};

const getForumTopicEmojiMap = async () => {
  if (cachedForumIcons && cachedForumIcons.expiresAt > Date.now()) {
    return cachedForumIcons.emojiToCustomId;
  }

  const bot = getBot();
  const stickers = await bot.api.getForumTopicIconStickers();
  const emojiToCustomId = new Map<string, string>();

  for (const sticker of stickers) {
    if (sticker.emoji && sticker.custom_emoji_id) {
      emojiToCustomId.set(sticker.emoji, sticker.custom_emoji_id);
    }
  }

  cachedForumIcons = {
    expiresAt: Date.now() + FORUM_ICON_CACHE_TTL_MS,
    emojiToCustomId,
  };

  return emojiToCustomId;
};

export const maybeCreateTopicForPrompt = async (input: {
  telegramChatId: string;
  chatType: ChatType;
  prompt: string;
  existingMessageThreadId?: number;
  correlationId: string;
}): Promise<TopicCreationResult> => {
  const env = getEnv();
  if (!env.TOPIC_AUTOCREATE_ENABLED) {
    return {
      ...(typeof input.existingMessageThreadId === "number"
        ? { messageThreadId: input.existingMessageThreadId }
        : {}),
      created: false,
    };
  }

  if (!TOPIC_SUPPORTED_CHAT_TYPES.has(input.chatType)) {
    return {
      ...(typeof input.existingMessageThreadId === "number"
        ? { messageThreadId: input.existingMessageThreadId }
        : {}),
      created: false,
    };
  }

  if (typeof input.existingMessageThreadId === "number") {
    return {
      messageThreadId: input.existingMessageThreadId,
      created: false,
    };
  }

  if (input.chatType === "private" && !(await botSupportsTopicsMode())) {
    return {
      created: false,
    };
  }

  const retryAfter = topicCreateBackoffByChat.get(input.telegramChatId) ?? 0;
  if (retryAfter > Date.now()) {
    return {
      created: false,
    };
  }

  const suggestion = await suggestTopic(input.prompt);

  try {
    const emojiMap = await getForumTopicEmojiMap();
    const iconCustomEmojiId = emojiMap.get(suggestion.emoji);
    const bot = getBot();
    const createdTopic = await bot.api.createForumTopic(
      Number(input.telegramChatId),
      suggestion.title,
      {
        ...(iconCustomEmojiId ? { icon_custom_emoji_id: iconCustomEmojiId } : {}),
      },
    );

    await sendTelegramText(
      input.telegramChatId,
      `Created topic "${suggestion.title}" ${suggestion.emoji}. Continuing there.`,
      {
        messageThreadId: createdTopic.message_thread_id,
      },
    );

    logger.info("Created topic for new prompt.", {
      correlationId: input.correlationId,
      chatId: input.telegramChatId,
      messageThreadId: createdTopic.message_thread_id,
      title: suggestion.title,
      emoji: suggestion.emoji,
      source: suggestion.source,
    });

    return {
      messageThreadId: createdTopic.message_thread_id,
      created: true,
      title: suggestion.title,
      emoji: suggestion.emoji,
      source: suggestion.source,
    };
  } catch (error) {
    topicCreateBackoffByChat.set(
      input.telegramChatId,
      Date.now() + TOPIC_CREATE_RETRY_DELAY_MS,
    );
    logger.warn("Failed to auto-create topic; continuing in current chat context.", {
      correlationId: input.correlationId,
      chatId: input.telegramChatId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      created: false,
    };
  }
};
