import { Worker } from "bullmq";
import { renderApprovalCardText } from "@/approvals/presenter";
import { createApprovalPendingKeyboard } from "@/approvals/ui";
import { getToolApproval } from "@/db/queries";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { enqueueApprovalCountdown } from "@/queue/queues";
import { editTelegramText } from "@/telegram/bot";

const APPROVAL_COUNTDOWN_INTERVAL_MS = 30_000;

export const createApprovalCountdownWorker = () =>
  new Worker(
    "approval-countdowns",
    async (job) => {
      const approval = await getToolApproval(job.data.approvalId);
      if (!approval || approval.status !== "requested") {
        return;
      }

      if (
        typeof approval.promptMessageId !== "number" ||
        approval.promptMessageId <= 0
      ) {
        return;
      }

      const now = new Date();
      if (approval.expiresAt.getTime() <= now.getTime()) {
        return;
      }

      const card = renderApprovalCardText({
        approvalId: approval.approvalId,
        toolName: approval.toolName,
        inputJson: approval.inputJson,
        expiresAt: approval.expiresAt,
        riskProfile: approval.riskProfile,
        status: "requested",
        now,
      });

      await editTelegramText({
        chatId: approval.telegramChatId,
        messageId: approval.promptMessageId,
        text: card.text,
        replyMarkup: createApprovalPendingKeyboard(approval.callbackToken),
      });

      const delayMs = Math.min(
        APPROVAL_COUNTDOWN_INTERVAL_MS,
        Math.max(1_000, approval.expiresAt.getTime() - now.getTime()),
      );
      await enqueueApprovalCountdown({
        approvalId: approval.approvalId,
        correlationId: job.data.correlationId,
        delayMs,
      });
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  ).on("failed", (_job, error) => {
    logger.error("Approval countdown worker job failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
