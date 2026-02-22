import { Worker } from "bullmq";
import { executeAgentTurn } from "@/agent/ton-agent";
import { renderApprovalCardText } from "@/approvals/presenter";
import { createApprovalPendingKeyboard } from "@/approvals/ui";
import { getEnv } from "@/config/env";
import { touchSession, updateToolApprovalPromptMessage } from "@/db/queries";
import { withChatLock } from "@/locks/chat-lock";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { deadLetterQueue } from "@/queue/queues";
import {
  createTelegramTokenDraftStream,
  getBot,
  isTelegramMessageThreadNotFoundError,
  sendTelegramText,
} from "@/telegram/bot";

const sendApprovalCards = async (input: {
  chatId: string;
  messageThreadId?: number;
  replyToMessageId?: number;
  approvals: Array<{
    approvalId: string;
    callbackToken: string;
    toolName: string;
    toolCallId: string;
    riskProfile: "cautious" | "balanced" | "advanced";
    expiresAt: Date;
    inputJson: unknown;
  }>;
}) => {
  if (input.approvals.length === 0) {
    return;
  }

  const bot = getBot();
  for (const approval of input.approvals) {
    const keyboard = createApprovalPendingKeyboard(approval.callbackToken);
    const approvalText = renderApprovalCardText({
      approvalId: approval.approvalId,
      toolName: approval.toolName,
      inputJson: approval.inputJson,
      expiresAt: approval.expiresAt,
      riskProfile: approval.riskProfile,
      status: "requested",
    }).text;

    const options = {
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

    try {
      const response = await bot.api.sendMessage(
        Number(input.chatId),
        approvalText,
        options,
      );
      await updateToolApprovalPromptMessage({
        approvalId: approval.approvalId,
        telegramChatId: input.chatId,
        ...(typeof input.messageThreadId === "number"
          ? { messageThreadId: input.messageThreadId }
          : {}),
        promptMessageId: response.message_id,
      });
    } catch (error) {
      if (
        !isTelegramMessageThreadNotFoundError(error) ||
        typeof input.messageThreadId !== "number"
      ) {
        throw error;
      }

      logger.warn("Approval card thread not found; retrying in main chat context.", {
        chatId: input.chatId,
        messageThreadId: input.messageThreadId,
        error: error instanceof Error ? error.message : String(error),
      });

      const response = await bot.api.sendMessage(Number(input.chatId), approvalText, {
        reply_markup: keyboard,
      });
      await updateToolApprovalPromptMessage({
        approvalId: approval.approvalId,
        telegramChatId: input.chatId,
        promptMessageId: response.message_id,
      });
    }
  }
};

export const createAgentTurnWorker = () =>
  new Worker(
    "agent-turns",
    async (job) => {
      const env = getEnv();
      await withChatLock(
        String(job.data.telegramChatId),
        job.data.messageThreadId,
        async () => {
          const bot = getBot();
          const sendTypingAction = async () =>
            bot.api.sendChatAction(Number(job.data.telegramChatId), "typing", {
              ...(typeof job.data.messageThreadId === "number"
                ? { message_thread_id: job.data.messageThreadId }
                : {}),
            });

          await sendTypingAction().catch(() => undefined);
          const typingInterval = setInterval(() => {
            void sendTypingAction().catch(() => undefined);
          }, 4_000);

          try {
            const draftStream = await createTelegramTokenDraftStream(
              String(job.data.telegramChatId),
              {
                ...(typeof job.data.messageThreadId === "number"
                  ? { messageThreadId: job.data.messageThreadId }
                  : {}),
                draftSeed: job.data.correlationId,
                chatType: job.data.chatType,
              },
            );

            const result = await executeAgentTurn(job.data, {
              onTextDelta: (delta) => {
                draftStream.pushDelta(delta);
              },
            });
            await draftStream.finish(result.responseText);
            await sendTelegramText(String(job.data.telegramChatId), result.responseText, {
              ...(typeof job.data.messageThreadId === "number"
                ? { messageThreadId: job.data.messageThreadId }
                : {}),
              ...(typeof job.data.replyToMessageId === "number"
                ? { replyToMessageId: job.data.replyToMessageId }
                : {}),
            });
            if (env.APPROVAL_UX_V2_ENABLED) {
              await sendApprovalCards({
                chatId: String(job.data.telegramChatId),
                ...(typeof job.data.messageThreadId === "number"
                  ? { messageThreadId: job.data.messageThreadId }
                  : {}),
                ...(typeof job.data.replyToMessageId === "number"
                  ? { replyToMessageId: job.data.replyToMessageId }
                  : {}),
                approvals: result.approvals,
              });
            }

            await touchSession(job.data.sessionId);
          } catch (error) {
            await deadLetterQueue.add("deadletter-agent-turn" as const, {
              queue: "agent-turns",
              payload: job.data,
              reason: (error as Error).message,
              correlationId: job.data.correlationId,
            });
            logger.error("Agent turn failed.", {
              correlationId: job.data.correlationId,
              error: String(error),
            });
            await sendTelegramText(
              String(job.data.telegramChatId),
              "I could not complete that request. Please try again.",
              {
                ...(typeof job.data.messageThreadId === "number"
                  ? { messageThreadId: job.data.messageThreadId }
                  : {}),
                ...(typeof job.data.replyToMessageId === "number"
                  ? { replyToMessageId: job.data.replyToMessageId }
                  : {}),
              },
            );
            throw error;
          } finally {
            clearInterval(typingInterval);
          }
        },
      );
    },
    {
      connection: bullConnection,
      concurrency: 12,
    },
  );
