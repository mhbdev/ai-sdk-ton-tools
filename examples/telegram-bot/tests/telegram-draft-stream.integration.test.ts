import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const botMocks = vi.hoisted(() => ({
  sendMessageDraft: vi.fn(async () => undefined),
  getMe: vi.fn(async () => ({ has_topics_enabled: true })),
}));

vi.mock("grammy", () => {
  class MockBot {
    api = {
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

type DraftChunk = {
  atMs: number;
  delta: string;
};

type DraftStreamSession = {
  pushDelta: (delta: string) => void;
  finish: (finalText?: string) => Promise<boolean>;
};

const replayMockChunks = async (
  session: DraftStreamSession,
  chunks: DraftChunk[],
) => {
  let cursor = 0;
  for (const chunk of chunks) {
    const deltaMs = Math.max(0, chunk.atMs - cursor);
    if (deltaMs > 0) {
      await vi.advanceTimersByTimeAsync(deltaMs);
    }
    cursor = chunk.atMs;
    session.pushDelta(chunk.delta);
    await vi.runAllTicks();
  }
};

describe("telegram draft stream integration harness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T00:00:00.000Z"));
    botMocks.sendMessageDraft.mockClear();
    botMocks.getMe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("replays mocked text chunks and enforces draft update cadence", async () => {
    const { createTelegramTokenDraftStream } = await import("@/telegram/bot");

    const session = await createTelegramTokenDraftStream("12345", {
      chatType: "private",
      draftSeed: "cadence-test",
    });

    await replayMockChunks(session, [
      { atMs: 0, delta: "Hel" },
      { atMs: 15, delta: "lo" },
      { atMs: 30, delta: " world" },
    ]);

    const calls =
      botMocks.sendMessageDraft.mock.calls as unknown as Array<
        [number, number, string, Record<string, unknown>?]
      >;

    expect(botMocks.sendMessageDraft).toHaveBeenCalledTimes(1);
    expect(calls[0]?.[2]).toBe("Hel");

    await vi.advanceTimersByTimeAsync(149);
    expect(botMocks.sendMessageDraft).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(botMocks.sendMessageDraft).toHaveBeenCalledTimes(2);
    expect(calls[1]?.[2]).toBe("Hello world");

    const finished = await session.finish("Hello world!");
    expect(finished).toBe(true);
    expect(botMocks.sendMessageDraft).toHaveBeenCalledTimes(3);

    const [firstCall, secondCall, thirdCall] = calls;
    expect(firstCall?.[0]).toBe(12345);
    expect(secondCall?.[0]).toBe(12345);
    expect(thirdCall?.[0]).toBe(12345);
    expect(firstCall?.[1]).toBe(secondCall?.[1]);
    expect(secondCall?.[1]).toBe(thirdCall?.[1]);
    expect(thirdCall?.[2]).toBe("Hello world!");
  });

  it("returns a no-op stream outside private chats", async () => {
    const { createTelegramTokenDraftStream } = await import("@/telegram/bot");

    const session = await createTelegramTokenDraftStream("6789", {
      chatType: "supergroup",
      draftSeed: "noop",
    });

    session.pushDelta("ignored");
    const finished = await session.finish("ignored");

    expect(finished).toBe(false);
    expect(botMocks.sendMessageDraft).not.toHaveBeenCalled();
  });
});
