import { InlineKeyboard } from "grammy";
import { Worker } from "bullmq";
import { executeAgentTurn } from "@/agent/ton-agent";
import { buildApprovalPromptText } from "@/approvals/service";
import { touchSession } from "@/db/queries";
import { withChatLock } from "@/locks/chat-lock";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { deadLetterQueue } from "@/queue/queues";
import {
  createTelegramTokenDraftStream,
  getBot,
  sendTelegramText,
} from "@/telegram/bot";

const sendApprovalCards = async (input: {
  chatId: string;
  messageThreadId?: number;
  approvals: Array<{
    approvalId: string;
    toolName: string;
    toolCallId: string;
    expiresAt: Date;
    inputJson: unknown;
  }>;
}) => {
  if (input.approvals.length === 0) {
    return;
  }

  const bot = getBot();
  for (const approval of input.approvals) {
    const keyboard = new InlineKeyboard()
      .text("Approve", `approval:${approval.approvalId}:approve`)
      .text("Deny", `approval:${approval.approvalId}:deny`);

    await bot.api.sendMessage(
      Number(input.chatId),
      buildApprovalPromptText({
        approvalId: approval.approvalId,
        toolName: approval.toolName,
        toolInput: approval.inputJson,
        expiresAt: approval.expiresAt,
      }),
      {
        ...(typeof input.messageThreadId === "number"
          ? { message_thread_id: input.messageThreadId }
          : {}),
        reply_markup: keyboard,
      },
    );
  }
};

export const createAgentTurnWorker = () =>
  new Worker(
    "agent-turns",
    async (job) => {
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
            });
            await sendApprovalCards({
              chatId: String(job.data.telegramChatId),
              ...(typeof job.data.messageThreadId === "number"
                ? { messageThreadId: job.data.messageThreadId }
                : {}),
              approvals: result.approvals,
            });

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
