import type { Update } from "grammy/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideApproval: vi.fn(),
  getApprovalFromCallbackToken: vi.fn(),
  createApprovalPendingKeyboard: vi.fn(),
  renderApprovalCardText: vi.fn(),
  renderApprovalDetailsText: vi.fn(),
  createCorrelationId: vi.fn(() => "corr-test"),
  checkChatSpamLimit: vi.fn(),
  checkUserTurnQuota: vi.fn(),
  shouldSendRateLimitNotice: vi.fn(),
  formatRateLimitMessage: vi.fn(),
  findSessionByScope: vi.fn(),
  getDefaultWallet: vi.fn(),
  getOrCreateSession: vi.fn(),
  getSessionById: vi.fn(),
  getTelegramChat: vi.fn(),
  getTelegramUser: vi.fn(),
  listWalletsByUser: vi.fn(),
  setChatNetwork: vi.fn(),
  setDefaultWallet: vi.fn(),
  setTelegramChatPreferences: vi.fn(),
  setTelegramUserPreferences: vi.fn(),
  touchSession: vi.fn(),
  upsertTelegramChat: vi.fn(),
  upsertTelegramUser: vi.fn(),
  resolveEffectivePreferences: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  sendTelegramText: vi.fn(),
  editTelegramText: vi.fn(),
  botSendMessage: vi.fn(),
  isTelegramMessageThreadNotFoundError: vi.fn(),
  maybeCreateTopicForPrompt: vi.fn(),
  beginWalletConnectFlow: vi.fn(),
  cancelWalletConnectFlow: vi.fn(),
  getWalletConnectFlowStatus: vi.fn(),
}));

vi.mock("@/approvals/presenter", () => ({
  renderApprovalCardText: mocks.renderApprovalCardText,
  renderApprovalDetailsText: mocks.renderApprovalDetailsText,
}));

vi.mock("@/approvals/ui", () => ({
  createApprovalPendingKeyboard: mocks.createApprovalPendingKeyboard,
}));

vi.mock("@/approvals/service", () => ({
  decideApproval: mocks.decideApproval,
  getApprovalFromCallbackToken: mocks.getApprovalFromCallbackToken,
}));

vi.mock("@/utils/id", () => ({
  createCorrelationId: mocks.createCorrelationId,
}));

vi.mock("@/config/env", () => ({
  getEnv: () => ({
    PERSONALIZATION_UX_ENABLED: true,
    MULTI_WALLET_ENABLED: true,
    APPROVAL_UX_V2_ENABLED: true,
  }),
}));

vi.mock("@/db/queries", () => ({
  findSessionByScope: mocks.findSessionByScope,
  getDefaultWallet: mocks.getDefaultWallet,
  getOrCreateSession: mocks.getOrCreateSession,
  getSessionById: mocks.getSessionById,
  getTelegramChat: mocks.getTelegramChat,
  getTelegramUser: mocks.getTelegramUser,
  listWalletsByUser: mocks.listWalletsByUser,
  setChatNetwork: mocks.setChatNetwork,
  setDefaultWallet: mocks.setDefaultWallet,
  setTelegramChatPreferences: mocks.setTelegramChatPreferences,
  setTelegramUserPreferences: mocks.setTelegramUserPreferences,
  touchSession: mocks.touchSession,
  upsertTelegramChat: mocks.upsertTelegramChat,
  upsertTelegramUser: mocks.upsertTelegramUser,
}));

vi.mock("@/preferences/resolver", () => ({
  resolveEffectivePreferences: mocks.resolveEffectivePreferences,
}));

vi.mock("@/queue/connection", () => ({
  redis: {
    get: mocks.redisGet,
    set: mocks.redisSet,
    del: mocks.redisDel,
  },
}));

vi.mock("@/telegram/bot", () => ({
  sendTelegramText: mocks.sendTelegramText,
  editTelegramText: mocks.editTelegramText,
  isTelegramMessageThreadNotFoundError: mocks.isTelegramMessageThreadNotFoundError,
  getBot: () => ({
    api: {
      sendMessage: mocks.botSendMessage,
    },
  }),
}));

vi.mock("@/telegram/topics", () => ({
  maybeCreateTopicForPrompt: mocks.maybeCreateTopicForPrompt,
}));

vi.mock("@/wallet/tonconnect", () => ({
  beginWalletConnectFlow: mocks.beginWalletConnectFlow,
  cancelWalletConnectFlow: mocks.cancelWalletConnectFlow,
  getWalletConnectFlowStatus: mocks.getWalletConnectFlowStatus,
}));

vi.mock("@/security/rate-limit", () => ({
  checkChatSpamLimit: mocks.checkChatSpamLimit,
  checkUserTurnQuota: mocks.checkUserTurnQuota,
  shouldSendRateLimitNotice: mocks.shouldSendRateLimitNotice,
  formatRateLimitMessage: mocks.formatRateLimitMessage,
}));

import { routeUpdate } from "@/telegram/router";

const createMessageUpdate = (text: string) =>
  ({
    update_id: 1,
    message: {
      message_id: 50,
      date: 1,
      chat: {
        id: 777,
        type: "private",
      },
      from: {
        id: 123,
        first_name: "Test",
        is_bot: false,
      },
      text,
    },
  }) as Update;

describe("router rate-limit integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.checkChatSpamLimit.mockResolvedValue({
      allowed: true,
      reason: "allowed",
      retryAfterSeconds: 0,
      tier: "free",
    });
    mocks.checkUserTurnQuota.mockResolvedValue({
      allowed: true,
      reason: "allowed",
      retryAfterSeconds: 0,
      tier: "free",
      dailyUsed: 1,
      dailyLimit: 300,
      resetsAtUtc: new Date("2026-02-23T00:00:00.000Z"),
    });
    mocks.shouldSendRateLimitNotice.mockResolvedValue(true);
    mocks.formatRateLimitMessage.mockReturnValue("Rate limit exceeded.");

    mocks.getTelegramChat.mockResolvedValue({
      activeModel: "openai/gpt-5.2",
      network: "mainnet",
    });
    mocks.getTelegramUser.mockResolvedValue({
      defaultResponseStyle: "concise",
      defaultRiskProfile: "balanced",
      defaultNetwork: "mainnet",
    });
    mocks.resolveEffectivePreferences.mockReturnValue({
      network: "mainnet",
      responseStyle: "concise",
      riskProfile: "balanced",
    });
    mocks.upsertTelegramUser.mockResolvedValue({
      defaultNetwork: "mainnet",
    });
    mocks.upsertTelegramChat.mockResolvedValue({});
    mocks.getOrCreateSession.mockResolvedValue({
      id: "session-1",
    });
    mocks.touchSession.mockResolvedValue(undefined);
    mocks.getDefaultWallet.mockResolvedValue(null);
    mocks.botSendMessage.mockResolvedValue({
      message_id: 9001,
    });
    mocks.isTelegramMessageThreadNotFoundError.mockReturnValue(false);
    mocks.listWalletsByUser.mockResolvedValue([]);
    mocks.findSessionByScope.mockResolvedValue(null);
    mocks.maybeCreateTopicForPrompt.mockResolvedValue({
      messageThreadId: undefined,
      created: false,
    });
  });

  it("does not consume AI-turn quota for /start", async () => {
    const result = await routeUpdate(createMessageUpdate("/start"));

    expect(result.shouldQueueTurn).toBe(false);
    expect(mocks.checkChatSpamLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkUserTurnQuota).not.toHaveBeenCalled();
    expect(mocks.botSendMessage).toHaveBeenCalledTimes(1);
  });

  it("renders settings menu with section-specific callback data", async () => {
    const result = await routeUpdate(createMessageUpdate("/settings"));

    expect(result.shouldQueueTurn).toBe(false);
    expect(mocks.botSendMessage).toHaveBeenCalledTimes(1);

    const call = mocks.botSendMessage.mock.calls[0];
    const options = (call?.[2] ?? {}) as {
      reply_markup?: {
        inline_keyboard?: Array<Array<{ callback_data?: string }>>;
      };
    };
    const callbackData = (options.reply_markup?.inline_keyboard ?? [])
      .flatMap((row) => row)
      .map((button) => button.callback_data)
      .filter((value): value is string => typeof value === "string");

    expect(callbackData).toContain("cfg:style:open:style");
    expect(callbackData).toContain("cfg:risk:open:risk");
    expect(callbackData).toContain("cfg:network:open:network");
    expect(callbackData).toContain("cfg:wallet:open:wallet");
  });

  it("blocks normal prompt when daily quota is exhausted", async () => {
    mocks.checkUserTurnQuota.mockResolvedValue({
      allowed: false,
      reason: "user_daily",
      retryAfterSeconds: 3600,
      tier: "free",
      dailyUsed: 301,
      dailyLimit: 300,
      resetsAtUtc: new Date("2026-02-23T00:00:00.000Z"),
    });
    mocks.formatRateLimitMessage.mockReturnValue(
      "Daily usage limit reached (301/300). Resets at 2026-02-23 00:00 UTC.",
    );

    const result = await routeUpdate(createMessageUpdate("hello"));

    expect(result.shouldQueueTurn).toBe(false);
    expect(mocks.checkUserTurnQuota).toHaveBeenCalledTimes(1);
    expect(mocks.shouldSendRateLimitNotice).toHaveBeenCalledWith({
      telegramUserId: "123",
      reason: "user_daily",
    });
    expect(mocks.sendTelegramText).toHaveBeenCalledTimes(1);
    expect(mocks.maybeCreateTopicForPrompt).not.toHaveBeenCalled();
    expect(mocks.getOrCreateSession).not.toHaveBeenCalled();
  });

  it("treats unknown slash command as an AI turn", async () => {
    const result = await routeUpdate(createMessageUpdate("/foo"));

    expect(mocks.checkUserTurnQuota).toHaveBeenCalledTimes(1);
    expect(result.shouldQueueTurn).toBe(true);
    expect(result.turnRequest?.text).toBe("/foo");
  });
});
