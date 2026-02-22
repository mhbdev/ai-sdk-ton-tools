import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const botMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  sendMessageDraft: vi.fn(async () => undefined),
  getMe: vi.fn(async () => ({
    has_topics_enabled: true,
    allows_users_to_create_topics: true,
  })),
}));

vi.mock("grammy", () => {
  class MockBot {
    api = {
      sendMessage: botMocks.sendMessage,
      sendMessageDraft: botMocks.sendMessageDraft,
      getMe: botMocks.getMe,
    };

    catch() {
      return this;
    }
  }

  return {
    Bot: MockBot,
  };
});

vi.mock("@/config/env", () => ({
  getEnv: () =>
    ({
      TELEGRAM_BOT_TOKEN: "123456:abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_ENABLE_STREAM_DRAFTS: true,
    }) as const,
}));

describe("sendTelegramText parse mode handling", () => {
  beforeEach(() => {
    botMocks.sendMessage.mockReset();
    botMocks.sendMessageDraft.mockReset();
    botMocks.getMe.mockReset();
    botMocks.sendMessageDraft.mockResolvedValue(undefined);
    botMocks.getMe.mockResolvedValue({
      has_topics_enabled: true,
      allows_users_to_create_topics: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("falls back to plain text when telegram parse-mode entities fail", async () => {
    botMocks.sendMessage
      .mockRejectedValueOnce(new Error("Bad Request: can't parse entities"))
      .mockResolvedValueOnce(undefined);

    const { sendTelegramText } = await import("@/telegram/bot");
    await sendTelegramText("12345", "**bold**");

    expect(botMocks.sendMessage).toHaveBeenCalledTimes(2);
    const firstCall = botMocks.sendMessage.mock.calls[0] as unknown as [
      number,
      string,
      Record<string, unknown>,
    ];
    const secondCall = botMocks.sendMessage.mock.calls[1] as unknown as [
      number,
      string,
      Record<string, unknown>,
    ];

    expect(firstCall[1]).toContain("<b>bold</b>");
    expect(firstCall[2].parse_mode).toBe("HTML");
    expect(secondCall[1]).toBe("**bold**");
    expect(secondCall[2].parse_mode).toBeUndefined();
  });

  it("sends replies to a specific source message id when provided", async () => {
    botMocks.sendMessage.mockResolvedValueOnce(undefined);

    const { sendTelegramText } = await import("@/telegram/bot");
    await sendTelegramText("12345", "hello", {
      replyToMessageId: 77,
    });

    expect(botMocks.sendMessage).toHaveBeenCalledTimes(1);
    const call = botMocks.sendMessage.mock.calls[0] as unknown as [
      number,
      string,
      Record<string, unknown>,
    ];
    const replyParameters = call[2].reply_parameters as
      | { message_id: number; allow_sending_without_reply: boolean }
      | undefined;

    expect(call[0]).toBe(12345);
    expect(call[1]).toBe("hello");
    expect(replyParameters?.message_id).toBe(77);
    expect(replyParameters?.allow_sending_without_reply).toBe(true);
  });

  it("retries in main chat when message thread is missing", async () => {
    botMocks.sendMessage
      .mockRejectedValueOnce(new Error("Bad Request: message thread not found"))
      .mockResolvedValueOnce(undefined);

    const { sendTelegramText } = await import("@/telegram/bot");
    await sendTelegramText("12345", "hello", {
      messageThreadId: 987,
      replyToMessageId: 77,
    });

    expect(botMocks.sendMessage).toHaveBeenCalledTimes(2);
    const firstCall = botMocks.sendMessage.mock.calls[0] as unknown as [
      number,
      string,
      Record<string, unknown>,
    ];
    const secondCall = botMocks.sendMessage.mock.calls[1] as unknown as [
      number,
      string,
      Record<string, unknown>,
    ];

    expect(firstCall[2].message_thread_id).toBe(987);
    expect(firstCall[2].reply_parameters).toMatchObject({ message_id: 77 });
    expect(secondCall[2].message_thread_id).toBeUndefined();
    expect(secondCall[2].reply_parameters).toBeUndefined();
  });
});
