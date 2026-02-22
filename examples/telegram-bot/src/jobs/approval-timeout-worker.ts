import { Worker } from "bullmq";
import { renderApprovalCardText } from "@/approvals/presenter";
import { appendAuditEvent } from "@/db/queries";
import { expirePendingApproval, getSessionById, getToolApproval } from "@/db/queries";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { editTelegramText, sendTelegramText } from "@/telegram/bot";

export const createApprovalTimeoutWorker = () =>
  new Worker(
    "approval-timeouts",
    async (job) => {
      const approval = await getToolApproval(job.data.approvalId);
      if (!approval || approval.status !== "requested") {
        return;
      }

      if (approval.expiresAt.getTime() > Date.now()) {
        return;
      }

      const expired = await expirePendingApproval(approval.approvalId);
      await appendAuditEvent({
        actorType: "system",
        actorId: "approval-timeout-worker",
        eventType: "approval.expired",
        correlationId: job.data.correlationId,
        metadata: {
          approvalId: approval.approvalId,
          sessionId: approval.sessionId,
        },
      });

      if (
        expired &&
        typeof expired.promptMessageId === "number" &&
        expired.promptMessageId > 0
      ) {
        const expiredCard = renderApprovalCardText({
          approvalId: expired.approvalId,
          toolName: expired.toolName,
          inputJson: expired.inputJson,
          expiresAt: expired.expiresAt,
          riskProfile: expired.riskProfile,
          status: "expired",
          decidedAt: expired.decidedAt,
          decidedBy: expired.decidedBy,
        });

        await editTelegramText({
          chatId: expired.telegramChatId,
          messageId: expired.promptMessageId,
          text: expiredCard.text,
        });
      }

      const session = await getSessionById(approval.sessionId);
      if (session) {
        await sendTelegramText(
          session.telegramChatId,
          "Approval expired and was cancelled. You can request a new action if needed.",
          {
            ...(typeof session.messageThreadId === "number"
              ? { messageThreadId: session.messageThreadId }
              : {}),
          },
        );
      }

      logger.info("Expired stale approval.", {
        approvalId: approval.approvalId,
      });
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  );
