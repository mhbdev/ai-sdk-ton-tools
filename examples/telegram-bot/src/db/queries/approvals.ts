import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { toolApprovals } from "@/db/schema";
import type { ApprovalStatus, ToolApprovalRecord } from "@/types/contracts";

export const createToolApproval = async (record: ToolApprovalRecord) => {
  const [row] = await db.insert(toolApprovals).values(record).returning();
  if (!row) {
    throw new Error("Failed to create tool approval record.");
  }
  return row;
};

export const getToolApproval = async (approvalId: string) => {
  const [row] = await db
    .select()
    .from(toolApprovals)
    .where(eq(toolApprovals.approvalId, approvalId))
    .limit(1);
  return row ?? null;
};

export const getToolApprovalByCallbackToken = async (callbackToken: string) => {
  const [row] = await db
    .select()
    .from(toolApprovals)
    .where(eq(toolApprovals.callbackToken, callbackToken))
    .limit(1);
  return row ?? null;
};

export const updateToolApprovalDecision = async (input: {
  approvalId: string;
  status: ApprovalStatus;
  decidedBy: string;
  reason?: string;
}) => {
  const [row] = await db
    .update(toolApprovals)
    .set({
      status: input.status,
      decidedBy: input.decidedBy,
      decidedAt: new Date(),
      ...(input.reason ? { reason: input.reason } : {}),
    })
    .where(eq(toolApprovals.approvalId, input.approvalId))
    .returning();
  return row ?? null;
};

export const expirePendingApproval = async (approvalId: string) => {
  const [row] = await db
    .update(toolApprovals)
    .set({
      status: "expired",
      reason: "Approval expired",
      decidedAt: new Date(),
      decidedBy: "system",
    })
    .where(
      and(
        eq(toolApprovals.approvalId, approvalId),
        eq(toolApprovals.status, "requested"),
      ),
    )
    .returning();
  return row ?? null;
};

export const listExpiredApprovals = async (now: Date) => {
  return db
    .select()
    .from(toolApprovals)
    .where(
      and(eq(toolApprovals.status, "requested"), lt(toolApprovals.expiresAt, now)),
    );
};

export const updateToolApprovalPromptMessage = async (input: {
  approvalId: string;
  telegramChatId: string;
  messageThreadId?: number;
  promptMessageId: number;
}) => {
  const [row] = await db
    .update(toolApprovals)
    .set({
      telegramChatId: input.telegramChatId,
      ...(typeof input.messageThreadId === "number"
        ? { messageThreadId: input.messageThreadId }
        : { messageThreadId: null }),
      promptMessageId: input.promptMessageId,
    })
    .where(eq(toolApprovals.approvalId, input.approvalId))
    .returning();
  return row ?? null;
};
