import { InlineKeyboard } from "grammy";
import type { Update } from "grammy/types";
import { createCorrelationId } from "@/utils/id";
import { decideApproval } from "@/approvals/service";
import {
  findSessionByScope,
  getActiveWallet,
  getOrCreateSession,
  getSessionById,
  getTelegramChat,
  setChatNetwork,
  touchSession,
  upsertTelegramChat,
  upsertTelegramUser,
} from "@/db/queries";
import {
  getBot,
  isTelegramMessageThreadNotFoundError,
  sendTelegramText,
} from "@/telegram/bot";
import type { ChatType, TurnExecutionRequest, UpdateProcessingResult } from "@/types/contracts";
import { maybeCreateTopicForPrompt } from "@/telegram/topics";
import {
  beginWalletConnectFlow,
  cancelWalletConnectFlow,
  getWalletConnectFlowStatus,
} from "@/wallet/tonconnect";
import { checkAndIncrementRateLimit } from "@/security/rate-limit";

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

const sendWalletConnectPrompt = async (input: {
  telegramChatId: string;
  sessionId: string;
  connectUrl: string;
  expiresAt: Date;
  messageThreadId?: number;
  replyToMessageId?: number;
}) => {
  const keyboard = new InlineKeyboard()
    .url("Open Wallet App", input.connectUrl)
    .row()
    .text("Check Status", `wallet:status:${input.sessionId}`)
    .text("Cancel", `wallet:cancel:${input.sessionId}`);

  const text = [
    "Tap Open Wallet App and approve the TonConnect request.",
    "Your wallet status will update automatically here.",
    "If it takes longer than a few seconds, tap Check Status.",
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");

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
    reply_markup: keyboard,
  };

  const bot = getBot();
  try {
    await bot.api.sendMessage(Number(input.telegramChatId), text, baseOptions);
  } catch (error) {
    if (
      !isTelegramMessageThreadNotFoundError(error) ||
      typeof input.messageThreadId !== "number"
    ) {
      throw error;
    }

    await bot.api.sendMessage(Number(input.telegramChatId), text, {
      reply_markup: keyboard,
    });
  }
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
    const walletMatch = /^wallet:(status|cancel):([^:]+)$/.exec(callbackData);
    if (walletMatch) {
      const action = walletMatch[1];
      const sessionId = walletMatch[2];
      if (!action || !sessionId) {
        return { shouldQueueTurn: false };
      }

      const telegramUserId = String(callbackQuery.from.id);
      const telegramChatId = String(callbackQuery.message.chat.id);
      const messageThreadId = parseMessageThreadId(callbackQuery.message);
      const callbackMessageId = parseMessageId(callbackQuery.message);

      if (action === "status") {
        const status = await getWalletConnectFlowStatus({
          sessionId,
          telegramUserId,
          telegramChatId,
        });
        await sendTelegramText(telegramChatId, status.message, {
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

    const match = /^approval:([^:]+):(approve|deny)$/.exec(callbackData);
    if (!match) {
      return { shouldQueueTurn: false };
    }

    const approvalId = match[1];
    const action = match[2];
    if (!approvalId || !action) {
      return { shouldQueueTurn: false };
    }
    const correlationId = createCorrelationId();
    const telegramUserId = String(callbackQuery.from.id);
    const telegramChatId = String(callbackQuery.message.chat.id);
    const messageThreadId = parseMessageThreadId(callbackQuery.message);
    const callbackMessageId = parseMessageId(callbackQuery.message);

    const decision = await decideApproval({
      approvalId,
      approved: action === "approve",
      decidedBy: telegramUserId,
      correlationId,
      ...(action === "deny"
        ? { reason: "User denied via Telegram callback." }
        : {}),
    });

    if (!decision.ok) {
      await sendTelegramText(telegramChatId, `Approval not applied: ${decision.reason}`, {
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      });
      return { shouldQueueTurn: false };
    }
    if (!decision.approval) {
      await sendTelegramText(telegramChatId, "Approval not applied: missing approval.", {
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      });
      return { shouldQueueTurn: false };
    }

    let session = await getSessionById(decision.approval.sessionId);
    if (!session) {
      session = await getOrCreateSession({
        telegramChatId,
        telegramUserId,
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      });
    }
    await touchSession(session.id);

    const chat = await getTelegramChat(telegramChatId);
    const activeWallet = await getActiveWallet(telegramUserId);
    const turnRequest: TurnExecutionRequest = {
      correlationId,
      sessionId: session.id,
      telegramUserId: Number(telegramUserId),
      telegramChatId: Number(telegramChatId),
      ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      ...(typeof callbackMessageId === "number"
        ? { replyToMessageId: callbackMessageId }
        : {}),
      chatType: (chat?.chatType ?? "private") as ChatType,
      text: "",
      network: (chat?.network ?? "mainnet") as "mainnet" | "testnet",
      modelId: chat?.activeModel ?? process.env.AI_MODEL ?? "openai/gpt-5.2",
      approvalResponse: {
        approvalId,
        approved: action === "approve",
        ...(action === "deny"
          ? { reason: "User denied via Telegram callback." }
          : {}),
      },
      ...(activeWallet?.address ? { walletAddress: activeWallet.address } : {}),
    };

    return {
      shouldQueueTurn: true,
      turnRequest,
    };
  }

  const message = update.message;
  if (!message || !message.chat || !("text" in message) || !message.text) {
    return { shouldQueueTurn: false };
  }

  const from = message.from;
  if (!from) {
    return { shouldQueueTurn: false };
  }

  const telegramUserId = String(from.id);
  const telegramChatId = String(message.chat.id);
  const chatType = parseChatType(message.chat.type);
  const messageThreadId = parseMessageThreadId(message);
  const sourceMessageId = parseMessageId(message);
  const { command, args } = parseCommand(message.text);
  const turnCorrelationId = createCorrelationId();
  let effectiveMessageThreadId = messageThreadId;

  const allowedUserRate = await checkAndIncrementRateLimit({
    key: `user:${telegramUserId}`,
    max: 60,
    windowSeconds: 60,
  });
  const allowedChatRate = await checkAndIncrementRateLimit({
    key: `chat:${telegramChatId}`,
    max: 200,
    windowSeconds: 60,
  });
  if (!allowedUserRate || !allowedChatRate) {
    await sendTelegramText(
      telegramChatId,
      "Rate limit exceeded. Please wait and try again.",
      {
        ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
      },
    );
    return { shouldQueueTurn: false };
  }

  await upsertTelegramUser({
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

  const session = await getOrCreateSession({
    telegramChatId,
    telegramUserId,
    ...(typeof effectiveMessageThreadId === "number"
      ? { messageThreadId: effectiveMessageThreadId }
      : {}),
  });
  await touchSession(session.id);
  if (command === "/start") {
    const chat = await getTelegramChat(telegramChatId);
    await sendTelegramText(
      telegramChatId,
      [
        "TON Agent Bot is online.",
        `Network: ${chat?.network ?? "mainnet"}`,
        "Use /network testnet or /network mainnet to switch networks.",
        "Use /wallet connect for one-tap wallet linking.",
      ].join("\n"),
      {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
          : {}),
      },
    );
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
        const chat = await getTelegramChat(telegramChatId);
        const connectFlow = await beginWalletConnectFlow({
          sessionId: session.id,
          telegramChatId,
          telegramUserId,
          network: (chat?.network ?? "mainnet") as "mainnet" | "testnet",
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
      } catch {
        await sendTelegramText(
          telegramChatId,
          "Unable to start wallet connection right now. Please try again in a moment.",
          {
            ...(typeof effectiveMessageThreadId === "number"
              ? { messageThreadId: effectiveMessageThreadId }
              : {}),
          },
        );
      }
      return { shouldQueueTurn: false };
    }

    if (subcommand === "status") {
      const status = await getWalletConnectFlowStatus({
        sessionId: session.id,
        telegramUserId,
        telegramChatId,
      });
      await sendTelegramText(telegramChatId, status.message, {
        ...(typeof effectiveMessageThreadId === "number"
          ? { messageThreadId: effectiveMessageThreadId }
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

    await sendTelegramText(
      telegramChatId,
      "Wallet commands:\n/wallet connect\n/wallet status\n/wallet cancel",
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

  const chat = await getTelegramChat(telegramChatId);
  const activeWallet = await getActiveWallet(telegramUserId);
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
    network: (chat?.network ?? "mainnet") as "mainnet" | "testnet",
    modelId: chat?.activeModel ?? process.env.AI_MODEL ?? "openai/gpt-5.2",
    ...(activeWallet?.address ? { walletAddress: activeWallet.address } : {}),
  };

  return {
    shouldQueueTurn: true,
    turnRequest,
  };
};
