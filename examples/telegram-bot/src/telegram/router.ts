import { InlineKeyboard } from "grammy";
import type { Update } from "grammy/types";
import {
  renderApprovalCardText,
  renderApprovalDetailsText,
} from "@/approvals/presenter";
import { createApprovalPendingKeyboard } from "@/approvals/ui";
import { createCorrelationId } from "@/utils/id";
import { decideApproval, getApprovalFromCallbackToken } from "@/approvals/service";
import { getEnv } from "@/config/env";
import {
  findSessionByScope,
  getDefaultWallet,
  getOrCreateSession,
  getSessionById,
  getTelegramChat,
  getTelegramUser,
  listWalletsByUser,
  setChatNetwork,
  setDefaultWallet,
  setTelegramChatPreferences,
  setTelegramUserPreferences,
  touchSession,
  upsertTelegramChat,
  upsertTelegramUser,
} from "@/db/queries";
import type { WalletLink } from "@/db/schema";
import { resolveEffectivePreferences } from "@/preferences/resolver";
import { redis } from "@/queue/connection";
import {
  editTelegramText,
  getBot,
  isTelegramMessageThreadNotFoundError,
  sendTelegramText,
} from "@/telegram/bot";
import type {
  ChatType,
  ResolvedPreferences,
  ResponseStyle,
  RiskProfile,
  TonNetwork,
  TurnExecutionRequest,
  UpdateProcessingResult,
} from "@/types/contracts";
import { maybeCreateTopicForPrompt } from "@/telegram/topics";
import {
  beginWalletConnectFlow,
  cancelWalletConnectFlow,
  getWalletConnectFlowStatus,
} from "@/wallet/tonconnect";
import {
  checkChatSpamLimit,
  checkUserTurnQuota,
  formatRateLimitMessage,
  shouldSendRateLimitNotice,
} from "@/security/rate-limit";
import { logger } from "@/observability/logger";

type SettingsScreen = "menu" | "style" | "risk" | "network" | "wallet";

const APPROVAL_CONFIRMATION_TTL_SECONDS = 30;
const SETTINGS_CALLBACK_RE = /^cfg:([^:]+):([^:]+):(.+)$/;
const APPROVAL_CALLBACK_RE = /^ap:([^:]+):(approve|deny|details|refresh)$/;
const TELEGRAM_INLINE_URL_ALLOWED_PROTOCOLS = new Set(["http:", "https:", "tg:"]);
const NON_TURN_COMMANDS = new Set([
  "/start",
  "/settings",
  "/network",
  "/wallet",
  "/cancel",
]);

const isNotifiableRateLimitReason = (
  reason: string,
): reason is "chat_flood" | "user_burst" | "user_minute" | "user_daily" =>
  reason === "chat_flood" ||
  reason === "user_burst" ||
  reason === "user_minute" ||
  reason === "user_daily";

const parseChatType = (value: string): ChatType => {
  if (
    value === "private" ||
    value === "group" ||
    value === "supergroup" ||
    value === "channel"
  ) {
    return value;
  }
  return "private";
};

const parseCommand = (text: string) => {
  const [command, ...args] = text.trim().split(/\s+/);
  return {
    command: (command ?? "").toLowerCase(),
    args,
  };
};

const parseMessageThreadId = (message: unknown): number | undefined => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const threadId = (message as { message_thread_id?: unknown }).message_thread_id;
  return typeof threadId === "number" ? threadId : undefined;
};

const parseMessageId = (message: unknown): number | undefined => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const messageId = (message as { message_id?: unknown }).message_id;
  return typeof messageId === "number" ? messageId : undefined;
};

const isResponseStyle = (value: string): value is ResponseStyle =>
  value === "concise" || value === "detailed";

const isRiskProfile = (value: string): value is RiskProfile =>
  value === "cautious" || value === "balanced" || value === "advanced";

const isTonNetwork = (value: string): value is TonNetwork =>
  value === "mainnet" || value === "testnet";

const isSettingsScreen = (value: string): value is SettingsScreen =>
  value === "menu" ||
  value === "style" ||
  value === "risk" ||
  value === "network" ||
  value === "wallet";

const formatStyleLabel = (value: ResponseStyle) =>
  value === "concise" ? "Concise" : "Detailed";

const formatRiskLabel = (value: RiskProfile) => {
  if (value === "cautious") {
    return "Cautious";
  }
  if (value === "balanced") {
    return "Balanced";
  }
  return "Advanced";
};

const shortenAddress = (address: string) =>
  address.length > 18
    ? `${address.slice(0, 7)}...${address.slice(address.length - 7)}`
    : address;

const toTelegramInlineUrl = (url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (TELEGRAM_INLINE_URL_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return url;
  }

  const env = getEnv();
  const appBaseUrl = env.APP_BASE_URL.endsWith("/")
    ? env.APP_BASE_URL
    : `${env.APP_BASE_URL}/`;
  const wrapped = new URL("tonconnect/open", appBaseUrl);
  wrapped.searchParams.set("target", url);
  return wrapped.toString();
};

const sendTelegramKeyboardMessage = async (input: {
  telegramChatId: string;
  text: string;
  keyboard: InlineKeyboard;
  messageThreadId?: number;
  replyToMessageId?: number;
}) => {
  const baseOptions = {
    ...(typeof input.messageThreadId === "number"
      ? { message_thread_id: input.messageThreadId }
      : {}),
    ...(typeof input.replyToMessageId === "number"
      ? {
          reply_parameters: {
            message_id: input.replyToMessageId,
            allow_sending_without_reply: true,
          },
        }
      : {}),
    reply_markup: input.keyboard,
  };

  const bot = getBot();
  try {
    const sent = await bot.api.sendMessage(
      Number(input.telegramChatId),
      input.text,
      baseOptions,
    );
    return sent.message_id;
  } catch (error) {
    if (
      !isTelegramMessageThreadNotFoundError(error) ||
      typeof input.messageThreadId !== "number"
    ) {
      throw error;
    }

    const sent = await bot.api.sendMessage(Number(input.telegramChatId), input.text, {
      reply_markup: input.keyboard,
    });
    return sent.message_id;
  }
};

const sendWalletConnectPrompt = async (input: {
  telegramChatId: string;
  sessionId: string;
  connectUrl: string;
  expiresAt: Date;
  messageThreadId?: number;
  replyToMessageId?: number;
}) => {
  const walletOpenUrl = toTelegramInlineUrl(input.connectUrl);
  const keyboard = new InlineKeyboard()
    .url("Open Wallet App", walletOpenUrl)
    .row()
    .text("Check Status", `wallet:status:${input.sessionId}`)
    .text("Cancel", `wallet:cancel:${input.sessionId}`);

  const text = [
    "Tap Open Wallet App and approve the TonConnect request.",
    "Your wallet status will update automatically here.",
    "If it takes longer than a few seconds, tap Check Status.",
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");

  await sendTelegramKeyboardMessage({
    telegramChatId: input.telegramChatId,
    text,
    keyboard,
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
    ...(typeof input.replyToMessageId === "number"
      ? { replyToMessageId: input.replyToMessageId }
      : {}),
  });
};

type WalletConnectStatus = Awaited<ReturnType<typeof getWalletConnectFlowStatus>>;

const sendWalletConnectStatus = async (input: {
  telegramChatId: string;
  sessionId: string;
  status: WalletConnectStatus;
  messageThreadId?: number;
  replyToMessageId?: number;
}) => {
  if (
    input.status.status === "pending" &&
    typeof input.status.connectUrl === "string" &&
    input.status.connectUrl.length > 0
  ) {
    const walletOpenUrl = toTelegramInlineUrl(input.status.connectUrl);
    const keyboard = new InlineKeyboard()
      .url("Open Wallet App", walletOpenUrl)
      .row()
      .text("Check Status", `wallet:status:${input.sessionId}`)
      .text("Cancel", `wallet:cancel:${input.sessionId}`);

    await sendTelegramKeyboardMessage({
      telegramChatId: input.telegramChatId,
      text: input.status.message,
      keyboard,
      ...(typeof input.messageThreadId === "number"
        ? { messageThreadId: input.messageThreadId }
        : {}),
      ...(typeof input.replyToMessageId === "number"
        ? { replyToMessageId: input.replyToMessageId }
        : {}),
    });
    return;
  }

  await sendTelegramText(input.telegramChatId, input.status.message, {
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
    ...(typeof input.replyToMessageId === "number"
      ? { replyToMessageId: input.replyToMessageId }
      : {}),
  });
};

const buildSettingsView = (input: {
  screen: SettingsScreen;
  prefs: ResolvedPreferences;
  userDefaults: {
    style: ResponseStyle;
    risk: RiskProfile;
    network: TonNetwork;
  };
  chatOverrides: {
    style: ResponseStyle | null;
    risk: RiskProfile | null;
    network: TonNetwork;
  };
  wallets: WalletLink[];
  multiWalletEnabled: boolean;
}) => {
  const header = [
    "Settings",
    `Current style: ${formatStyleLabel(input.prefs.responseStyle)}`,
    `Current risk profile: ${formatRiskLabel(input.prefs.riskProfile)}`,
    `Current network: ${input.prefs.network}`,
  ];

  if (input.screen === "menu") {
    const keyboard = new InlineKeyboard()
      .text("Response Style", "cfg:style:open:style")
      .text("Risk Profile", "cfg:risk:open:risk")
      .row()
      .text("Network", "cfg:network:open:network")
      .text("Wallet", "cfg:wallet:open:wallet");

    return {
      text: [...header, "", "Choose a section to update your preferences."].join("\n"),
      keyboard,
    };
  }

  if (input.screen === "style") {
    const keyboard = new InlineKeyboard()
      .text(
        `${input.chatOverrides.style === "concise" ? "• " : ""}This chat concise`,
        "cfg:style:chat:concise",
      )
      .text(
        `${input.chatOverrides.style === "detailed" ? "• " : ""}This chat detailed`,
        "cfg:style:chat:detailed",
      )
      .row()
      .text(
        `${input.chatOverrides.style === null ? "• " : ""}This chat uses default`,
        "cfg:style:chat:inherit",
      )
      .row()
      .text(
        `${input.userDefaults.style === "concise" ? "• " : ""}Default concise`,
        "cfg:style:user:concise",
      )
      .text(
        `${input.userDefaults.style === "detailed" ? "• " : ""}Default detailed`,
        "cfg:style:user:detailed",
      )
      .row()
      .text("Back", "cfg:root:open:menu");

    return {
      text: [
        ...header,
        "",
        "Response style controls how much detail the assistant provides.",
        `User default: ${formatStyleLabel(input.userDefaults.style)}`,
        `Chat override: ${input.chatOverrides.style ?? "inherit"}`,
      ].join("\n"),
      keyboard,
    };
  }

  if (input.screen === "risk") {
    const keyboard = new InlineKeyboard()
      .text(
        `${input.chatOverrides.risk === "cautious" ? "• " : ""}This chat cautious`,
        "cfg:risk:chat:cautious",
      )
      .text(
        `${input.chatOverrides.risk === "balanced" ? "• " : ""}This chat balanced`,
        "cfg:risk:chat:balanced",
      )
      .row()
      .text(
        `${input.chatOverrides.risk === "advanced" ? "• " : ""}This chat advanced`,
        "cfg:risk:chat:advanced",
      )
      .text(
        `${input.chatOverrides.risk === null ? "• " : ""}This chat uses default`,
        "cfg:risk:chat:inherit",
      )
      .row()
      .text(
        `${input.userDefaults.risk === "cautious" ? "• " : ""}Default cautious`,
        "cfg:risk:user:cautious",
      )
      .text(
        `${input.userDefaults.risk === "balanced" ? "• " : ""}Default balanced`,
        "cfg:risk:user:balanced",
      )
      .row()
      .text(
        `${input.userDefaults.risk === "advanced" ? "• " : ""}Default advanced`,
        "cfg:risk:user:advanced",
      )
      .row()
      .text("Back", "cfg:root:open:menu");

    return {
      text: [
        ...header,
        "",
        "Risk profile controls warning strictness and approval friction.",
        `User default: ${formatRiskLabel(input.userDefaults.risk)}`,
        `Chat override: ${input.chatOverrides.risk ?? "inherit"}`,
      ].join("\n"),
      keyboard,
    };
  }

  if (input.screen === "network") {
    const keyboard = new InlineKeyboard()
      .text(
        `${input.chatOverrides.network === "mainnet" ? "• " : ""}This chat mainnet`,
        "cfg:network:chat:mainnet",
      )
      .text(
        `${input.chatOverrides.network === "testnet" ? "• " : ""}This chat testnet`,
        "cfg:network:chat:testnet",
      )
      .row()
      .text("This chat uses default", "cfg:network:chat:inherit")
      .row()
      .text(
        `${input.userDefaults.network === "mainnet" ? "• " : ""}Default mainnet`,
        "cfg:network:user:mainnet",
      )
      .text(
        `${input.userDefaults.network === "testnet" ? "• " : ""}Default testnet`,
        "cfg:network:user:testnet",
      )
      .row()
      .text("Back", "cfg:root:open:menu");

    return {
      text: [
        ...header,
        "",
        "Network selection controls chain context for reads and writes.",
        `User default: ${input.userDefaults.network}`,
        `Chat network: ${input.chatOverrides.network}`,
      ].join("\n"),
      keyboard,
    };
  }

  const keyboard = new InlineKeyboard();
  const walletLines =
    input.wallets.length > 0
      ? input.wallets.map((wallet, index) => {
          const marker = wallet.isDefault ? "default" : "available";
          const label = `${index + 1}. ${shortenAddress(wallet.address)} (${marker})`;
          keyboard.text(
            wallet.isDefault
              ? `Default ${shortenAddress(wallet.address)}`
              : `Set ${shortenAddress(wallet.address)}`,
            `cfg:wallet:set:${wallet.id}`,
          );
          keyboard.row();
          return label;
        })
      : ["No linked wallets yet."];

  keyboard.text("Connect Wallet", "cfg:wallet:connect:start").row().text(
    "Back",
    "cfg:root:open:menu",
  );

  const walletScopeLine = input.multiWalletEnabled
    ? "Multi-wallet mode enabled. Pick your default wallet below."
    : "Multi-wallet mode is disabled.";

  return {
    text: [
      ...header,
      "",
      walletScopeLine,
      "Wallets:",
      ...walletLines,
    ].join("\n"),
    keyboard,
  };
};

const renderAndSendSettingsScreen = async (input: {
  telegramUserId: string;
  telegramChatId: string;
  screen: SettingsScreen;
  messageThreadId?: number;
  targetMessageId?: number;
}) => {
  const env = getEnv();
  const [user, chat, wallets] = await Promise.all([
    getTelegramUser(input.telegramUserId),
    getTelegramChat(input.telegramChatId),
    env.MULTI_WALLET_ENABLED ? listWalletsByUser(input.telegramUserId) : Promise.resolve([]),
  ]);

  if (!user || !chat) {
    return;
  }

  const prefs = resolveEffectivePreferences({
    user,
    chat,
  });

  const view = buildSettingsView({
    screen: input.screen,
    prefs,
    userDefaults: {
      style: user.defaultResponseStyle,
      risk: user.defaultRiskProfile,
      network: user.defaultNetwork,
    },
    chatOverrides: {
      style: chat.responseStyleOverride,
      risk: chat.riskProfileOverride,
      network: chat.network,
    },
    wallets,
    multiWalletEnabled: env.MULTI_WALLET_ENABLED,
  });

  if (typeof input.targetMessageId === "number") {
    await editTelegramText({
      chatId: input.telegramChatId,
      messageId: input.targetMessageId,
      text: view.text,
      replyMarkup: view.keyboard,
    });
    return;
  }

  await sendTelegramKeyboardMessage({
    telegramChatId: input.telegramChatId,
    text: view.text,
    keyboard: view.keyboard,
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
  });
};

const ensureRecordsForCallback = async (input: {
  telegramUserId: string;
  telegramChatId: string;
  chatType: ChatType;
  firstName?: string;
  username?: string;
  locale?: string;
}) => {
  await upsertTelegramUser({
    telegramUserId: input.telegramUserId,
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.username ? { username: input.username } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
  });

  await upsertTelegramChat({
    telegramChatId: input.telegramChatId,
    chatType: input.chatType,
    modelId: process.env.AI_MODEL ?? "openai/gpt-5.2",
  });
};

const maybeRequireSecondApprovalTap = async (input: {
  approvalId: string;
  telegramUserId: string;
}) => {
  const key = `approval-confirm:${input.approvalId}:${input.telegramUserId}`;
  const existing = await redis.get(key);
  if (existing) {
    await redis.del(key);
    return false;
  }

  await redis.set(
    key,
    "1",
    "EX",
    APPROVAL_CONFIRMATION_TTL_SECONDS,
  );
  return true;
};

const handleApprovalCallback = async (input: {
  callbackToken: string;
  action: "approve" | "deny" | "details" | "refresh";
  telegramUserId: string;
  telegramChatId: string;
  messageThreadId?: number;
  callbackMessageId?: number;
  chatType: ChatType;
}): Promise<UpdateProcessingResult> => {
  const approval = await getApprovalFromCallbackToken(input.callbackToken);
  if (!approval) {
    await sendTelegramText(input.telegramChatId, "Approval request was not found.", {
      ...(typeof input.messageThreadId === "number" ? { messageThreadId: input.messageThreadId } : {}),
    });
    return { shouldQueueTurn: false };
  }

  if (input.action === "details") {
    const details = renderApprovalDetailsText({
      approvalId: approval.approvalId,
      toolName: approval.toolName,
      inputJson: approval.inputJson,
      expiresAt: approval.expiresAt,
      riskProfile: approval.riskProfile,
      status: approval.status,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    });
    await sendTelegramText(input.telegramChatId, details.text, {
      ...(typeof input.messageThreadId === "number" ? { messageThreadId: input.messageThreadId } : {}),
      ...(typeof input.callbackMessageId === "number"
        ? { replyToMessageId: input.callbackMessageId }
        : {}),
    });
    return { shouldQueueTurn: false };
  }

  const renderAndEditApproval = async (
    status: "requested" | "approved" | "denied" | "expired" | "failed",
  ) => {
    if (typeof approval.promptMessageId !== "number" || approval.promptMessageId <= 0) {
      return;
    }

    const card = renderApprovalCardText({
      approvalId: approval.approvalId,
      toolName: approval.toolName,
      inputJson: approval.inputJson,
      expiresAt: approval.expiresAt,
      riskProfile: approval.riskProfile,
      status,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    });

    await editTelegramText({
      chatId: approval.telegramChatId,
      messageId: approval.promptMessageId,
      text: card.text,
      replyMarkup:
        status === "requested"
          ? createApprovalPendingKeyboard(approval.callbackToken)
          : null,
    });
  };

  if (input.action === "refresh") {
    await renderAndEditApproval(approval.status);
    return { shouldQueueTurn: false };
  }

  if (approval.status !== "requested") {
    await renderAndEditApproval(approval.status);
    await sendTelegramText(
      input.telegramChatId,
      `Approval is already ${approval.status}.`,
      {
        ...(typeof input.messageThreadId === "number"
          ? { messageThreadId: input.messageThreadId }
          : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  if (input.action === "approve") {
    const preview = renderApprovalCardText({
      approvalId: approval.approvalId,
      toolName: approval.toolName,
      inputJson: approval.inputJson,
      expiresAt: approval.expiresAt,
      riskProfile: approval.riskProfile,
      status: "requested",
    });

    if (preview.cautiousRequiresSecondTap) {
      const shouldBlock = await maybeRequireSecondApprovalTap({
        approvalId: approval.approvalId,
        telegramUserId: input.telegramUserId,
      });
      if (shouldBlock) {
        await sendTelegramText(
          input.telegramChatId,
          "Cautious mode: tap Approve again within 30s to confirm this high-risk action.",
          {
            ...(typeof input.messageThreadId === "number"
              ? { messageThreadId: input.messageThreadId }
              : {}),
            ...(typeof input.callbackMessageId === "number"
              ? { replyToMessageId: input.callbackMessageId }
              : {}),
          },
        );
        return { shouldQueueTurn: false };
      }
    }
  }

  const correlationId = createCorrelationId();
  const decision = await decideApproval({
    approvalId: approval.approvalId,
    approved: input.action === "approve",
    decidedBy: input.telegramUserId,
    correlationId,
    ...(input.action === "deny"
      ? { reason: "User denied via Telegram callback." }
      : {}),
  });

  if (!decision.ok || !decision.approval) {
    await sendTelegramText(
      input.telegramChatId,
      `Approval not applied: ${decision.reason ?? "unknown"}`,
      {
        ...(typeof input.messageThreadId === "number"
          ? { messageThreadId: input.messageThreadId }
          : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  approval.status = decision.approval.status;
  approval.decidedBy = decision.approval.decidedBy;
  approval.decidedAt = decision.approval.decidedAt;
  await renderAndEditApproval(decision.approval.status);

  let session = await getSessionById(decision.approval.sessionId);
  if (!session) {
    session = await getOrCreateSession({
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      ...(typeof input.messageThreadId === "number"
        ? { messageThreadId: input.messageThreadId }
        : {}),
    });
  }
  await touchSession(session.id);

  const [chat, user, defaultWallet] = await Promise.all([
    getTelegramChat(input.telegramChatId),
    getTelegramUser(input.telegramUserId),
    getDefaultWallet(input.telegramUserId),
  ]);
  const prefs = resolveEffectivePreferences({
    user,
    chat,
  });

  const turnRequest: TurnExecutionRequest = {
    correlationId,
    sessionId: session.id,
    telegramUserId: Number(input.telegramUserId),
    telegramChatId: Number(input.telegramChatId),
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
    ...(typeof input.callbackMessageId === "number"
      ? { replyToMessageId: input.callbackMessageId }
      : {}),
    chatType: input.chatType,
    text: "",
    network: prefs.network,
    modelId: chat?.activeModel ?? process.env.AI_MODEL ?? "openai/gpt-5.2",
    responseStyle: prefs.responseStyle,
    riskProfile: decision.approval.riskProfile,
    approvalResponse: {
      approvalId: decision.approval.approvalId,
      approved: input.action === "approve",
      ...(input.action === "deny"
        ? { reason: "User denied via Telegram callback." }
        : {}),
    },
    ...(defaultWallet?.address ? { walletAddress: defaultWallet.address } : {}),
  };

  return {
    shouldQueueTurn: true,
    turnRequest,
  };
};

const handleSettingsCallback = async (input: {
  section: string;
  target: string;
  value: string;
  telegramUserId: string;
  telegramChatId: string;
  chatType: ChatType;
  messageThreadId?: number;
  callbackMessageId?: number;
}): Promise<UpdateProcessingResult> => {
  const env = getEnv();
  if (!env.PERSONALIZATION_UX_ENABLED) {
    await sendTelegramText(
      input.telegramChatId,
      "Settings are currently disabled by configuration.",
      {
        ...(typeof input.messageThreadId === "number"
          ? { messageThreadId: input.messageThreadId }
          : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  let targetScreen: SettingsScreen = "menu";

  if (input.section === "root" && input.target === "open" && isSettingsScreen(input.value)) {
    targetScreen = input.value;
  }

  if (input.section === "style") {
    targetScreen = "style";
    if (input.target === "user" && isResponseStyle(input.value)) {
      await setTelegramUserPreferences({
        telegramUserId: input.telegramUserId,
        responseStyle: input.value,
      });
    } else if (input.target === "chat") {
      if (isResponseStyle(input.value)) {
        await setTelegramChatPreferences({
          telegramChatId: input.telegramChatId,
          responseStyleOverride: input.value,
        });
      } else if (input.value === "inherit") {
        await setTelegramChatPreferences({
          telegramChatId: input.telegramChatId,
          responseStyleOverride: null,
        });
      }
    } else if (input.target === "open" && isSettingsScreen(input.value)) {
      targetScreen = input.value;
    }
  }

  if (input.section === "risk") {
    targetScreen = "risk";
    if (input.target === "user" && isRiskProfile(input.value)) {
      await setTelegramUserPreferences({
        telegramUserId: input.telegramUserId,
        riskProfile: input.value,
      });
    } else if (input.target === "chat") {
      if (isRiskProfile(input.value)) {
        await setTelegramChatPreferences({
          telegramChatId: input.telegramChatId,
          riskProfileOverride: input.value,
        });
      } else if (input.value === "inherit") {
        await setTelegramChatPreferences({
          telegramChatId: input.telegramChatId,
          riskProfileOverride: null,
        });
      }
    } else if (input.target === "open" && isSettingsScreen(input.value)) {
      targetScreen = input.value;
    }
  }

  if (input.section === "network") {
    targetScreen = "network";
    if (input.target === "user" && isTonNetwork(input.value)) {
      await setTelegramUserPreferences({
        telegramUserId: input.telegramUserId,
        network: input.value,
      });
    } else if (input.target === "chat") {
      if (isTonNetwork(input.value)) {
        await setChatNetwork(input.telegramChatId, input.value);
      } else if (input.value === "inherit") {
        const user = await getTelegramUser(input.telegramUserId);
        await setChatNetwork(
          input.telegramChatId,
          user?.defaultNetwork ?? "mainnet",
        );
      }
    } else if (input.target === "open" && isSettingsScreen(input.value)) {
      targetScreen = input.value;
    }
  }

  if (input.section === "wallet") {
    targetScreen = "wallet";

    if (input.target === "set" && env.MULTI_WALLET_ENABLED) {
      await setDefaultWallet({
        telegramUserId: input.telegramUserId,
        walletId: input.value,
      });
    }

    if (input.target === "connect" && input.value === "start") {
      if (input.chatType !== "private") {
        await sendTelegramText(
          input.telegramChatId,
          "Wallet linking is only supported in private chats.",
          {
            ...(typeof input.messageThreadId === "number"
              ? { messageThreadId: input.messageThreadId }
              : {}),
          },
        );
      } else {
        const session = await getOrCreateSession({
          telegramChatId: input.telegramChatId,
          telegramUserId: input.telegramUserId,
          ...(typeof input.messageThreadId === "number"
            ? { messageThreadId: input.messageThreadId }
            : {}),
        });
        const user = await getTelegramUser(input.telegramUserId);
        const chat = await getTelegramChat(input.telegramChatId);
        const prefs = resolveEffectivePreferences({
          user,
          chat,
        });
        try {
          const connectFlow = await beginWalletConnectFlow({
            sessionId: session.id,
            telegramChatId: input.telegramChatId,
            telegramUserId: input.telegramUserId,
            network: prefs.network,
            correlationId: createCorrelationId(),
            ...(typeof input.messageThreadId === "number"
              ? { messageThreadId: input.messageThreadId }
              : {}),
          });

          await sendWalletConnectPrompt({
            telegramChatId: input.telegramChatId,
            sessionId: session.id,
            connectUrl: connectFlow.connectUrl,
            expiresAt: connectFlow.expiresAt,
            ...(typeof input.messageThreadId === "number"
              ? { messageThreadId: input.messageThreadId }
              : {}),
            ...(typeof input.callbackMessageId === "number"
              ? { replyToMessageId: input.callbackMessageId }
              : {}),
          });
        } catch (error) {
          logger.warn("Wallet connect flow start failed from settings callback.", {
            telegramUserId: input.telegramUserId,
            telegramChatId: input.telegramChatId,
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
          });
          const status = await getWalletConnectFlowStatus({
            sessionId: session.id,
            telegramUserId: input.telegramUserId,
            telegramChatId: input.telegramChatId,
          });
          await sendWalletConnectStatus({
            telegramChatId: input.telegramChatId,
            sessionId: session.id,
            status,
            ...(typeof input.messageThreadId === "number"
              ? { messageThreadId: input.messageThreadId }
              : {}),
            ...(typeof input.callbackMessageId === "number"
              ? { replyToMessageId: input.callbackMessageId }
              : {}),
          });
        }
      }
    }

    if (input.target === "open" && isSettingsScreen(input.value)) {
      targetScreen = input.value;
    }
  }

  await renderAndSendSettingsScreen({
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    screen: targetScreen,
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
    ...(typeof input.callbackMessageId === "number"
      ? { targetMessageId: input.callbackMessageId }
      : {}),
  });

  return { shouldQueueTurn: false };
};

export const routeUpdate = async (update: Update): Promise<UpdateProcessingResult> => {
  const callbackQuery = update.callback_query;
  if (
    callbackQuery &&
    callbackQuery.message &&
    callbackQuery.from &&
    callbackQuery.data
  ) {
    const callbackData = callbackQuery.data;
    const telegramUserId = String(callbackQuery.from.id);
    const telegramChatId = String(callbackQuery.message.chat.id);
    const chatType = parseChatType(callbackQuery.message.chat.type);
    const messageThreadId = parseMessageThreadId(callbackQuery.message);
    const callbackMessageId = parseMessageId(callbackQuery.message);

    await ensureRecordsForCallback({
      telegramUserId,
      telegramChatId,
      chatType,
      firstName: callbackQuery.from.first_name,
      ...(callbackQuery.from.username
        ? { username: callbackQuery.from.username }
        : {}),
      ...(callbackQuery.from.language_code
        ? { locale: callbackQuery.from.language_code }
        : {}),
    });

    const walletMatch = /^wallet:(status|cancel):([^:]+)$/.exec(callbackData);
    if (walletMatch) {
      const action = walletMatch[1];
      const sessionId = walletMatch[2];
      if (!action || !sessionId) {
        return { shouldQueueTurn: false };
      }

      if (action === "status") {
        const status = await getWalletConnectFlowStatus({
          sessionId,
          telegramUserId,
          telegramChatId,
        });
        await sendWalletConnectStatus({
          telegramChatId,
          sessionId,
          status,
          ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
          ...(typeof callbackMessageId === "number"
            ? { replyToMessageId: callbackMessageId }
            : {}),
        });
        return { shouldQueueTurn: false };
      }

      const cancellation = await cancelWalletConnectFlow({
        sessionId,
        telegramUserId,
        telegramChatId,
      });
      await sendTelegramText(telegramChatId, cancellation.message, {
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
        ...(typeof callbackMessageId === "number"
          ? { replyToMessageId: callbackMessageId }
          : {}),
      });
      return { shouldQueueTurn: false };
    }

    const approvalMatch = APPROVAL_CALLBACK_RE.exec(callbackData);
    if (approvalMatch) {
      const callbackToken = approvalMatch[1];
      const action = approvalMatch[2] as "approve" | "deny" | "details" | "refresh";
      if (!callbackToken) {
        return { shouldQueueTurn: false };
      }
      return handleApprovalCallback({
        callbackToken,
        action,
        telegramUserId,
        telegramChatId,
        chatType,
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
        ...(typeof callbackMessageId === "number"
          ? { callbackMessageId }
          : {}),
      });
    }

    const settingsMatch = SETTINGS_CALLBACK_RE.exec(callbackData);
    if (settingsMatch) {
      const section = settingsMatch[1];
      const target = settingsMatch[2];
      const value = settingsMatch[3];
      if (!section || !target || !value) {
        return { shouldQueueTurn: false };
      }

      return handleSettingsCallback({
        section,
        target,
        value,
        telegramUserId,
        telegramChatId,
        chatType,
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
        ...(typeof callbackMessageId === "number"
          ? { callbackMessageId }
          : {}),
      });
    }

    return { shouldQueueTurn: false };
  }

  const message = update.message;
  if (!message || !message.chat || !("text" in message) || !message.text) {
    return { shouldQueueTurn: false };
  }

  const from = message.from;
  if (!from) {
    return { shouldQueueTurn: false };
  }

  const env = getEnv();
  const telegramUserId = String(from.id);
  const telegramChatId = String(message.chat.id);
  const chatType = parseChatType(message.chat.type);
  const messageThreadId = parseMessageThreadId(message);
  const sourceMessageId = parseMessageId(message);
  const { command, args } = parseCommand(message.text);
  const turnCorrelationId = createCorrelationId();
  let effectiveMessageThreadId = messageThreadId;

  const chatRateDecision = await checkChatSpamLimit({
    telegramChatId,
    telegramUserId,
  });
  if (!chatRateDecision.allowed) {
    const blockedReason = isNotifiableRateLimitReason(chatRateDecision.reason)
      ? chatRateDecision.reason
      : "chat_flood";
    const shouldNotify = await shouldSendRateLimitNotice({
      telegramUserId,
      reason: blockedReason,
    });
    if (shouldNotify) {
      await sendTelegramText(telegramChatId, formatRateLimitMessage(chatRateDecision), {
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      });
    }
    return { shouldQueueTurn: false };
  }

  const existingChat = await getTelegramChat(telegramChatId);
  const user = await upsertTelegramUser({
    telegramUserId,
    firstName: from.first_name,
    ...(from.username ? { username: from.username } : {}),
    ...(from.language_code ? { locale: from.language_code } : {}),
  });

  await upsertTelegramChat({
    telegramChatId,
    chatType,
    modelId: process.env.AI_MODEL ?? "openai/gpt-5.2",
  });

  if (!existingChat && user) {
    await setChatNetwork(telegramChatId, user.defaultNetwork);
  }

  const shouldConsumeTurnQuota = !NON_TURN_COMMANDS.has(command);
  if (shouldConsumeTurnQuota) {
    const userQuotaDecision = await checkUserTurnQuota({
      telegramUserId,
    });
    if (!userQuotaDecision.allowed) {
      const blockedReason = isNotifiableRateLimitReason(userQuotaDecision.reason)
        ? userQuotaDecision.reason
        : "user_minute";
      const shouldNotify = await shouldSendRateLimitNotice({
        telegramUserId,
        reason: blockedReason,
      });
      if (shouldNotify) {
        await sendTelegramText(telegramChatId, formatRateLimitMessage(userQuotaDecision), {
          ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
        });
      }
      return { shouldQueueTurn: false };
    }
  }

  if (!command.startsWith("/")) {
    const shouldRetitleExistingThread =
      chatType === "private" && typeof effectiveMessageThreadId === "number"
        ? (await findSessionByScope({
            telegramChatId,
            telegramUserId,
            messageThreadId: effectiveMessageThreadId,
          })) === null
        : false;

    const topic = await maybeCreateTopicForPrompt({
      telegramChatId,
      chatType,
      prompt: message.text,
      ...(typeof effectiveMessageThreadId === "number"
        ? { existingMessageThreadId: effectiveMessageThreadId }
        : {}),
      ...(shouldRetitleExistingThread
        ? { shouldRetitleExistingThread: true }
        : {}),
      correlationId: turnCorrelationId,
    });
    if (typeof topic.messageThreadId === "number") {
      effectiveMessageThreadId = topic.messageThreadId;
    }
  }

  const [chat, refreshedUser] = await Promise.all([
    getTelegramChat(telegramChatId),
    getTelegramUser(telegramUserId),
  ]);
  const prefs = resolveEffectivePreferences({
    user: refreshedUser,
    chat,
  });

  const session = await getOrCreateSession({
    telegramChatId,
    telegramUserId,
    ...(typeof effectiveMessageThreadId === "number"
      ? { messageThreadId: effectiveMessageThreadId }
      : {}),
  });
  await touchSession(session.id);
  if (command === "/start") {
    const defaultWallet = await getDefaultWallet(telegramUserId);
    const toggleNetwork = prefs.network === "mainnet" ? "testnet" : "mainnet";
    const keyboard = new InlineKeyboard()
      .text("Settings", "cfg:root:open:menu")
      .row()
      .text("Connect Wallet", "cfg:wallet:connect:start")
      .row()
      .text(`Switch to ${toggleNetwork}`, `cfg:network:chat:${toggleNetwork}`);

    const text = [
      "TON Agent Bot is online.",
      `Network: ${prefs.network}`,
      `Response style: ${formatStyleLabel(prefs.responseStyle)}`,
      `Risk profile: ${formatRiskLabel(prefs.riskProfile)}`,
      `Default wallet: ${defaultWallet ? shortenAddress(defaultWallet.address) : "none linked"}`,
      "",
      "Use the buttons below for a guided setup.",
    ].join("\n");

    await sendTelegramKeyboardMessage({
      telegramChatId,
      text,
      keyboard,
      ...(typeof effectiveMessageThreadId === "number"
        ? { messageThreadId: effectiveMessageThreadId }
        : {}),
      ...(typeof sourceMessageId === "number"
        ? { replyToMessageId: sourceMessageId }
        : {}),
    });
    return { shouldQueueTurn: false };
  }

  if (command === "/settings") {
    if (!env.PERSONALIZATION_UX_ENABLED) {
      await sendTelegramText(
        telegramChatId,
        "Settings are currently disabled by configuration.",
        {
          ...(typeof effectiveMessageThreadId === "number"
            ? { messageThreadId: effectiveMessageThreadId }
            : {}),
        },
      );
      return { shouldQueueTurn: false };
    }

    await renderAndSendSettingsScreen({
      telegramUserId,
      telegramChatId,
      screen: "menu",
      ...(typeof effectiveMessageThreadId === "number"
        ? { messageThreadId: effectiveMessageThreadId }
        : {}),
    });
    return { shouldQueueTurn: false };
  }

  if (command === "/network") {
    const selected = args[0];
    if (selected !== "mainnet" && selected !== "testnet") {
      await sendTelegramText(telegramChatId, "Usage: /network mainnet|testnet", {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      });
      return { shouldQueueTurn: false };
    }
    await setChatNetwork(telegramChatId, selected);
    await sendTelegramText(telegramChatId, `Network switched to ${selected}.`, {
      ...(typeof effectiveMessageThreadId === "number"
        ? { messageThreadId: effectiveMessageThreadId }
        : {}),
    });
    return { shouldQueueTurn: false };
  }

  if (command === "/wallet") {
    const subcommand = args[0]?.toLowerCase();
    if (subcommand === "connect") {
      if (chatType !== "private") {
        await sendTelegramText(
          telegramChatId,
          "Wallet linking is only supported in private chats in v1.",
          {
            ...(typeof effectiveMessageThreadId === "number"
              ? { messageThreadId: effectiveMessageThreadId }
              : {}),
          },
        );
        return { shouldQueueTurn: false };
      }

      try {
        const connectFlow = await beginWalletConnectFlow({
          sessionId: session.id,
          telegramChatId,
          telegramUserId,
          network: prefs.network,
          correlationId: turnCorrelationId,
          ...(typeof effectiveMessageThreadId === "number"
            ? { messageThreadId: effectiveMessageThreadId }
            : {}),
        });

        await sendWalletConnectPrompt({
          telegramChatId,
          sessionId: session.id,
          connectUrl: connectFlow.connectUrl,
          expiresAt: connectFlow.expiresAt,
          ...(typeof effectiveMessageThreadId === "number"
            ? { messageThreadId: effectiveMessageThreadId }
            : {}),
          ...(typeof sourceMessageId === "number"
            ? { replyToMessageId: sourceMessageId }
            : {}),
        });
      } catch (error) {
        logger.warn("Wallet connect flow start failed from command.", {
          telegramUserId,
          telegramChatId,
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
        const status = await getWalletConnectFlowStatus({
          sessionId: session.id,
          telegramUserId,
          telegramChatId,
        });
        await sendWalletConnectStatus({
          telegramChatId,
          sessionId: session.id,
          status,
          ...(typeof effectiveMessageThreadId === "number"
            ? { messageThreadId: effectiveMessageThreadId }
            : {}),
          ...(typeof sourceMessageId === "number"
            ? { replyToMessageId: sourceMessageId }
            : {}),
        });
      }
      return { shouldQueueTurn: false };
    }

    if (subcommand === "status") {
      const status = await getWalletConnectFlowStatus({
        sessionId: session.id,
        telegramUserId,
        telegramChatId,
      });
      await sendWalletConnectStatus({
        telegramChatId,
        sessionId: session.id,
        status,
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
        ...(typeof sourceMessageId === "number"
          ? { replyToMessageId: sourceMessageId }
          : {}),
      });
      return { shouldQueueTurn: false };
    }

    if (subcommand === "cancel") {
      const cancellation = await cancelWalletConnectFlow({
        sessionId: session.id,
        telegramUserId,
        telegramChatId,
      });
      await sendTelegramText(telegramChatId, cancellation.message, {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      });
      return { shouldQueueTurn: false };
    }

    if (subcommand === "list") {
      const wallets = await listWalletsByUser(telegramUserId);
      const lines =
        wallets.length > 0
          ? wallets.map((wallet, index) =>
              `${index + 1}. ${shortenAddress(wallet.address)}${wallet.isDefault ? " (default)" : ""}`,
            )
          : ["No linked wallets."];

      await sendTelegramText(telegramChatId, ["Wallets:", ...lines].join("\n"), {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      });
      return { shouldQueueTurn: false };
    }

    await sendTelegramText(
      telegramChatId,
      "Wallet commands:\n/wallet connect\n/wallet status\n/wallet cancel\n/wallet list",
      {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  if (command === "/cancel") {
    await sendTelegramText(
      telegramChatId,
      "Cancelled pending operation context. You can continue with a new request.",
      {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  const defaultWallet = await getDefaultWallet(telegramUserId);
  const turnRequest: TurnExecutionRequest = {
    correlationId: turnCorrelationId,
    sessionId: session.id,
    telegramUserId: Number(telegramUserId),
    telegramChatId: Number(telegramChatId),
    ...(typeof effectiveMessageThreadId === "number"
      ? { messageThreadId: effectiveMessageThreadId }
      : {}),
    ...(typeof sourceMessageId === "number"
      ? { replyToMessageId: sourceMessageId }
      : {}),
    chatType,
    text: message.text,
    network: prefs.network,
    modelId: chat?.activeModel ?? process.env.AI_MODEL ?? "openai/gpt-5.2",
    responseStyle: prefs.responseStyle,
    riskProfile: prefs.riskProfile,
    ...(defaultWallet?.address ? { walletAddress: defaultWallet.address } : {}),
  };

  return {
    shouldQueueTurn: true,
    turnRequest,
  };
};
