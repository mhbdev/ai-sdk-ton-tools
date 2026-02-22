import { InlineKeyboard } from "grammy";
import { Worker } from "bullmq";
import { executeAgentTurn } from "@/agent/ton-agent";
import { buildApprovalPromptText } from "@/approvals/service";
import { touchSession } from "@/db/queries";
import { withChatLock } from "@/locks/chat-lock";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { deadLetterQueue } from "@/queue/queues";
import { sendTelegramText } from "@/telegram/bot";

const sendApprovalCards = async (input: {
  chatId: string;
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

  const { getBot } = await import("@/telegram/bot");
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
        reply_markup: keyboard,
      },
    );
  }
};

export const createAgentTurnWorker = () =>
  new Worker(
    "agent-turns",
    async (job) => {
      await withChatLock(String(job.data.telegramChatId), async () => {
        try {
          const result = await executeAgentTurn(job.data);

          await sendTelegramText(String(job.data.telegramChatId), result.responseText);
          await sendApprovalCards({
            chatId: String(job.data.telegramChatId),
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
          );
          throw error;
        }
      });
    },
    {
      connection: bullConnection,
      concurrency: 12,
    },
  );
