import { generateText, Output } from "ai";
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
  "🧪",
  "💡",
  "📚",
  "🔎",
  "✅",
  "💰",
] as const;

const GENERIC_TOPIC_TITLE_PATTERNS = [
  /^new chat$/i,
  /^new topic$/i,
  /^chat$/i,
  /^topic$/i,
  /^discussion$/i,
  /^ton discussion$/i,
  /^general$/i,
];

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
  updated?: boolean;
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

const canonicalizeEmoji = (emoji: string) =>
  emoji
    .normalize("NFKC")
    .replace(/\uFE0F/g, "")
    .trim();

const isGenericTopicTitle = (title: string) => {
  const normalized = normalizeWhitespace(title).toLowerCase();
  return GENERIC_TOPIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .trim();

const GREETING_WORDS = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "sup",
  "buddy",
  "friend",
  "there",
  "gm",
  "gn",
  "morning",
  "afternoon",
  "evening",
]);

const isCasualGreetingPrompt = (prompt: string) => {
  const normalized = normalizeWhitespace(prompt)
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .trim();
  if (!normalized) {
    return false;
  }

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 5) {
    return false;
  }

  let greetingWordCount = 0;
  for (const word of words) {
    if (GREETING_WORDS.has(word)) {
      greetingWordCount += 1;
      continue;
    }
    return false;
  }
  return greetingWordCount > 0;
};

const emojiToCodePoints = (emoji: string) =>
  Array.from(emoji)
    .map((char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`)
    .join(" ");

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
  if (isCasualGreetingPrompt(prompt)) {
    return "General Chat";
  }

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
    return "✅";
  }
  if (/(debug|error|test|qa|bug)/.test(lowered)) {
    return "🧪";
  }
  if (/(nft|jetton|token|asset)/.test(lowered)) {
    return "💰";
  }
  if (/(learn|guide|how|explain|what is)/.test(lowered)) {
    return "📚";
  }
  if (/(analy[sz]e|inspect|trace|search|find)/.test(lowered)) {
    return "🔎";
  }
  return DEFAULT_EMOJI;
};

const toSupportedEmoji = (emojiCandidate: string, prompt: string) => {
  const normalized = canonicalizeEmoji(emojiCandidate);
  const matched = TOPIC_EMOJI_CHOICES.find(
    (item) => canonicalizeEmoji(item) === normalized,
  );
  if (matched) {
    return matched;
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
  const { output } = await generateText({
    model: getOpenRouter()(env.AI_TOPIC_MODEL),
    output: Output.object({
      schema: topicNameSchema,
      name: "telegram_topic_name",
      description:
        "A concise Telegram topic title and emoji for the user's first message in a thread.",
    }),
    temperature: 0.2,
    maxOutputTokens: 80,
    prompt: [
      "Create a concise Telegram forum topic title and one emoji for this user request.",
      "Rules:",
      "- title must be short, specific, plain text, <= 64 chars",
      "- never use generic labels like New Chat, Chat, Topic, or Discussion",
      `- emoji must be one of: ${TOPIC_EMOJI_CHOICES.join(", ")}`,
      "- no markdown",
      "",
      `User request: ${prompt}`,
    ].join("\n"),
  });

  return {
    title: sanitizeTitle(output.title),
    emoji: toSupportedEmoji(output.emoji, prompt),
    source: "llm",
  };
};

const suggestTopicWithLlmTextFallback = async (
  prompt: string,
): Promise<TopicSuggestion> => {
  const env = getEnv();
  const { text } = await generateText({
    model: getOpenRouter()(env.AI_TOPIC_MODEL),
    temperature: 0.2,
    maxOutputTokens: 120,
    prompt: [
      "Return ONLY valid JSON with keys title and emoji.",
      "Rules:",
      "- title must be short, specific, plain text, <= 64 chars",
      "- never use generic labels like New Chat, Chat, Topic, or Discussion",
      `- emoji must be one of: ${TOPIC_EMOJI_CHOICES.join(", ")}`,
      "",
      "JSON example:",
      '{"title":"TON Wallet Help","emoji":"💸"}',
      "",
      `User request: ${prompt}`,
    ].join("\n"),
  });

  const jsonMatch = /{[\s\S]*}/.exec(text);
  if (!jsonMatch) {
    throw new Error("Topic naming fallback model response did not contain JSON.");
  }

  const parsed = topicNameSchema.safeParse(JSON.parse(jsonMatch[0]));
  if (!parsed.success) {
    throw new Error("Topic naming fallback model response did not match schema.");
  }

  return {
    title: sanitizeTitle(parsed.data.title),
    emoji: toSupportedEmoji(parsed.data.emoji, prompt),
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
    if (isGenericTopicTitle(llm.title)) {
      logger.info("Topic naming model returned generic title; using heuristic fallback.", {
        modelId: getEnv().AI_TOPIC_MODEL,
        llmTitle: llm.title,
      });
      return heuristic;
    }
    return llm;
  } catch (structuredError) {
    try {
      const llmFallback = await suggestTopicWithLlmTextFallback(normalizedPrompt);
      if (isGenericTopicTitle(llmFallback.title)) {
        logger.info("Topic naming text fallback returned generic title; using heuristic fallback.", {
          modelId: getEnv().AI_TOPIC_MODEL,
          llmTitle: llmFallback.title,
        });
        return heuristic;
      }
      logger.info("Topic naming text fallback succeeded after structured output failure.", {
        modelId: getEnv().AI_TOPIC_MODEL,
      });
      return llmFallback;
    } catch (textFallbackError) {
      logger.warn("Topic naming model failed; using heuristic fallback.", {
        structuredError:
          structuredError instanceof Error
            ? structuredError.message
            : String(structuredError),
        textFallbackError:
          textFallbackError instanceof Error
            ? textFallbackError.message
            : String(textFallbackError),
        modelId: getEnv().AI_TOPIC_MODEL,
      });
      return heuristic;
    }
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
      emojiToCustomId.set(canonicalizeEmoji(sticker.emoji), sticker.custom_emoji_id);
    }
  }

  cachedForumIcons = {
    expiresAt: Date.now() + FORUM_ICON_CACHE_TTL_MS,
    emojiToCustomId,
  };

  return emojiToCustomId;
};

const resolveTopicIconSelection = (
  emojiMap: Map<string, string>,
  preferredEmoji: string,
) => {
  let selectedEmoji = preferredEmoji;
  let iconCustomEmojiId = emojiMap.get(canonicalizeEmoji(selectedEmoji));

  if (!iconCustomEmojiId) {
    selectedEmoji = DEFAULT_EMOJI;
    iconCustomEmojiId = emojiMap.get(canonicalizeEmoji(selectedEmoji));
  }

  if (!iconCustomEmojiId && emojiMap.size > 0) {
    const firstSupported = emojiMap.keys().next().value as string | undefined;
    if (firstSupported) {
      selectedEmoji = firstSupported;
      iconCustomEmojiId = emojiMap.get(firstSupported);
    }
  }

  return {
    selectedEmoji,
    iconCustomEmojiId,
  };
};

export const maybeCreateTopicForPrompt = async (input: {
  telegramChatId: string;
  chatType: ChatType;
  prompt: string;
  existingMessageThreadId?: number;
  shouldRetitleExistingThread?: boolean;
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

  const retryAfter = topicCreateBackoffByChat.get(input.telegramChatId) ?? 0;
  if (retryAfter > Date.now()) {
    return {
      ...(typeof input.existingMessageThreadId === "number"
        ? { messageThreadId: input.existingMessageThreadId }
        : {}),
      created: false,
    };
  }

  if (typeof input.existingMessageThreadId === "number") {
    if (
      input.chatType !== "private" ||
      input.shouldRetitleExistingThread !== true
    ) {
      return {
        messageThreadId: input.existingMessageThreadId,
        created: false,
      };
    }

    if (!(await botSupportsTopicsMode())) {
      return {
        messageThreadId: input.existingMessageThreadId,
        created: false,
      };
    }

    const suggestion = await suggestTopic(input.prompt);
    try {
      const emojiMap = await getForumTopicEmojiMap();
      const { selectedEmoji, iconCustomEmojiId } = resolveTopicIconSelection(
        emojiMap,
        suggestion.emoji,
      );

      const bot = getBot();
      await bot.api.editForumTopic(
        Number(input.telegramChatId),
        input.existingMessageThreadId,
        {
          name: suggestion.title,
          ...(iconCustomEmojiId ? { icon_custom_emoji_id: iconCustomEmojiId } : {}),
        },
      );

      logger.info("Updated existing topic metadata from initial prompt.", {
        correlationId: input.correlationId,
        chatId: input.telegramChatId,
        messageThreadId: input.existingMessageThreadId,
        title: suggestion.title,
        emoji: selectedEmoji,
        emojiCodePoints: emojiToCodePoints(selectedEmoji),
        source: suggestion.source,
      });

      return {
        messageThreadId: input.existingMessageThreadId,
        created: false,
        updated: true,
        title: suggestion.title,
        emoji: selectedEmoji,
        source: suggestion.source,
      };
    } catch (error) {
      topicCreateBackoffByChat.set(
        input.telegramChatId,
        Date.now() + TOPIC_CREATE_RETRY_DELAY_MS,
      );
      logger.warn("Failed to update existing topic metadata.", {
        correlationId: input.correlationId,
        chatId: input.telegramChatId,
        messageThreadId: input.existingMessageThreadId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        messageThreadId: input.existingMessageThreadId,
        created: false,
      };
    }
  }

  if (input.chatType === "private" && !(await botSupportsTopicsMode())) {
    return {
      created: false,
    };
  }

  const suggestion = await suggestTopic(input.prompt);

  try {
    const emojiMap = await getForumTopicEmojiMap();
    const { selectedEmoji, iconCustomEmojiId } = resolveTopicIconSelection(
      emojiMap,
      suggestion.emoji,
    );

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
      `Created topic "${suggestion.title}" ${selectedEmoji}. Continuing there.`,
      {
        messageThreadId: createdTopic.message_thread_id,
      },
    );

    logger.info("Created topic for new prompt.", {
      correlationId: input.correlationId,
      chatId: input.telegramChatId,
      messageThreadId: createdTopic.message_thread_id,
      title: suggestion.title,
      emoji: selectedEmoji,
      emojiCodePoints: emojiToCodePoints(selectedEmoji),
      source: suggestion.source,
    });

    return {
      messageThreadId: createdTopic.message_thread_id,
      created: true,
      title: suggestion.title,
      emoji: selectedEmoji,
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
