import { Worker } from "bullmq";
import { appendAuditEvent } from "@/db/queries";
import { expirePendingApproval, getSessionById, getToolApproval } from "@/db/queries";
import { logger } from "@/observability/logger";
import { bullConnection } from "@/queue/connection";
import { sendTelegramText } from "@/telegram/bot";

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

      await expirePendingApproval(approval.approvalId);
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

      const session = await getSessionById(approval.sessionId);
      if (session) {
        await sendTelegramText(
          session.telegramChatId,
          `Approval ${approval.approvalId} expired and was cancelled.`,
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
