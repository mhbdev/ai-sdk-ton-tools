import type { Update } from "grammy/types";
import { createCorrelationId } from "@/utils/id";
import { decideApproval } from "@/approvals/service";
import {
  getActiveWallet,
  getOrCreateSession,
  getTelegramChat,
  setChatNetwork,
  touchSession,
  upsertTelegramChat,
  upsertTelegramUser,
} from "@/db/queries";
import { sendTelegramText } from "@/telegram/bot";
import type { ChatType, TurnExecutionRequest, UpdateProcessingResult } from "@/types/contracts";
import {
  issueWalletConnectChallenge,
  parseProofPayloadFromCommand,
  verifyTonConnectProof,
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

export const routeUpdate = async (update: Update): Promise<UpdateProcessingResult> => {
  const callbackQuery = update.callback_query;
  if (
    callbackQuery &&
    callbackQuery.message &&
    callbackQuery.from &&
    callbackQuery.data
  ) {
    const callbackData = callbackQuery.data;
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

    const session = await getOrCreateSession({
      telegramChatId,
      telegramUserId,
    });
    await touchSession(session.id);

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
      await sendTelegramText(telegramChatId, `Approval not applied: ${decision.reason}`);
      return { shouldQueueTurn: false };
    }

    const chat = await getTelegramChat(telegramChatId);
    const activeWallet = await getActiveWallet(telegramUserId);
    const turnRequest: TurnExecutionRequest = {
      correlationId,
      sessionId: session.id,
      telegramUserId: Number(telegramUserId),
      telegramChatId: Number(telegramChatId),
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

  const session = await getOrCreateSession({
    telegramChatId,
    telegramUserId,
  });
  await touchSession(session.id);

  const { command, args } = parseCommand(message.text);
  if (command === "/start") {
    const chat = await getTelegramChat(telegramChatId);
    await sendTelegramText(
      telegramChatId,
      [
        "TON Agent Bot is online.",
        `Network: ${chat?.network ?? "mainnet"}`,
        "Use /network testnet or /network mainnet to switch networks.",
        "Use /wallet connect to start wallet link flow.",
      ].join("\n"),
    );
    return { shouldQueueTurn: false };
  }

  if (command === "/network") {
    const selected = args[0];
    if (selected !== "mainnet" && selected !== "testnet") {
      await sendTelegramText(telegramChatId, "Usage: /network mainnet|testnet");
      return { shouldQueueTurn: false };
    }
    await setChatNetwork(telegramChatId, selected);
    await sendTelegramText(telegramChatId, `Network switched to ${selected}.`);
    return { shouldQueueTurn: false };
  }

  if (command === "/wallet") {
    const subcommand = args[0]?.toLowerCase();
    if (subcommand === "connect") {
      const challenge = await issueWalletConnectChallenge({
        telegramChatId,
        telegramUserId,
      });
      await sendTelegramText(
        telegramChatId,
        `Wallet connection challenge created.\n${challenge.connectHint}`,
      );
      return { shouldQueueTurn: false };
    }

    if (subcommand === "prove") {
      const proofPayload = parseProofPayloadFromCommand(message.text);
      if (!proofPayload) {
        await sendTelegramText(
          telegramChatId,
          "Usage: /wallet prove <base64-encoded-proof-json>",
        );
        return { shouldQueueTurn: false };
      }

      try {
        await verifyTonConnectProof({
          telegramUserId,
          payload: proofPayload,
        });
        await sendTelegramText(
          telegramChatId,
          `Wallet linked: ${proofPayload.address}`,
        );
      } catch (error) {
        await sendTelegramText(
          telegramChatId,
          `Wallet proof verification failed: ${(error as Error).message}`,
        );
      }
      return { shouldQueueTurn: false };
    }

    await sendTelegramText(
      telegramChatId,
      "Wallet commands:\n/wallet connect\n/wallet prove <base64-json>",
    );
    return { shouldQueueTurn: false };
  }

  if (command === "/cancel") {
    await sendTelegramText(
      telegramChatId,
      "Cancelled pending operation context. You can continue with a new request.",
    );
    return { shouldQueueTurn: false };
  }

  const chat = await getTelegramChat(telegramChatId);
  const activeWallet = await getActiveWallet(telegramUserId);
  const turnRequest: TurnExecutionRequest = {
    correlationId: createCorrelationId(),
    sessionId: session.id,
    telegramUserId: Number(telegramUserId),
    telegramChatId: Number(telegramChatId),
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
