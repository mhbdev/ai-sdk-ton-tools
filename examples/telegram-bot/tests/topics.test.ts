import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(async () => ({
    output: {
      title: "Wallet Connection Help",
      emoji: "💸",
    },
  })),
  sendTelegramText: vi.fn(async () => undefined),
  getForumTopicIconStickers: vi.fn(async () => [
    {
      emoji: "💸",
      custom_emoji_id: "emoji-wallet",
    },
  ]),
  createForumTopic: vi.fn(async () => ({
    message_thread_id: 9001,
  })),
  editForumTopic: vi.fn(async () => true),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: (value: unknown) => value,
  },
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => () => "mock-model",
}));

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    OPENROUTER_API_KEY: "test-openrouter-key",
    AI_TOPIC_MODEL: "openai/gpt-4o-mini",
    TOPIC_AUTOCREATE_ENABLED: true,
  }),
}));

vi.mock("@/telegram/bot", () => ({
  getBot: () => ({
    api: {
      getForumTopicIconStickers: mocks.getForumTopicIconStickers,
      createForumTopic: mocks.createForumTopic,
      editForumTopic: mocks.editForumTopic,
    },
  }),
  botSupportsTopicsMode: async () => true,
  sendTelegramText: mocks.sendTelegramText,
}));

describe("maybeCreateTopicForPrompt", () => {
  beforeEach(() => {
    mocks.generateText.mockClear();
    mocks.sendTelegramText.mockClear();
    mocks.getForumTopicIconStickers.mockClear();
    mocks.createForumTopic.mockClear();
    mocks.editForumTopic.mockClear();
  });

  it("retitles an existing private thread on first prompt", async () => {
    const { maybeCreateTopicForPrompt } = await import("@/telegram/topics");

    const result = await maybeCreateTopicForPrompt({
      telegramChatId: "12345",
      chatType: "private",
      prompt: "Help me connect my wallet",
      existingMessageThreadId: 321,
      shouldRetitleExistingThread: true,
      correlationId: "corr-1",
    });

    expect(mocks.editForumTopic).toHaveBeenCalledTimes(1);
    expect(mocks.editForumTopic).toHaveBeenCalledWith(12345, 321, {
      name: "Wallet Connection Help",
      icon_custom_emoji_id: "emoji-wallet",
    });
    expect(mocks.createForumTopic).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      messageThreadId: 321,
      created: false,
      updated: true,
      title: "Wallet Connection Help",
      emoji: "💸",
      source: "llm",
    });
  });

  it("does not retitle existing threads unless explicitly allowed", async () => {
    const { maybeCreateTopicForPrompt } = await import("@/telegram/topics");

    const result = await maybeCreateTopicForPrompt({
      telegramChatId: "12345",
      chatType: "private",
      prompt: "Swap TON to USDT",
      existingMessageThreadId: 654,
      correlationId: "corr-2",
    });

    expect(result).toEqual({
      messageThreadId: 654,
      created: false,
    });
    expect(mocks.editForumTopic).not.toHaveBeenCalled();
    expect(mocks.createForumTopic).not.toHaveBeenCalled();
  });

  it("uses greeting heuristic title when topic naming model yields no output", async () => {
    mocks.generateText
      .mockRejectedValueOnce(new Error("No output generated."))
      .mockRejectedValueOnce(new Error("No output generated."));

    const { maybeCreateTopicForPrompt } = await import("@/telegram/topics");

    const result = await maybeCreateTopicForPrompt({
      telegramChatId: "12345",
      chatType: "private",
      prompt: "Hello buddy!",
      existingMessageThreadId: 777,
      shouldRetitleExistingThread: true,
      correlationId: "corr-3",
    });

    expect(mocks.editForumTopic).toHaveBeenCalledTimes(1);
    expect(mocks.editForumTopic).toHaveBeenCalledWith(12345, 777, {
      name: "General Chat",
      icon_custom_emoji_id: "emoji-wallet",
    });
    expect(result).toMatchObject({
      messageThreadId: 777,
      created: false,
      updated: true,
      title: "General Chat",
      source: "heuristic",
    });
  });
});
