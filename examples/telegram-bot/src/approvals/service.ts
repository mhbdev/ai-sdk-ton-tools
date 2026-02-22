import { createHash } from "node:crypto";
import {
  createToolApproval,
  expirePendingApproval,
  getToolApproval,
  updateToolApprovalDecision,
} from "@/db/queries";
import { appendAuditEvent } from "@/db/queries/audit";
import { logger } from "@/observability/logger";
import { enqueueApprovalTimeout } from "@/queue/queues";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

type ToolApprovalRequestPart = {
  type: "tool-approval-request";
  approvalId: string;
  toolCall: {
    toolName: string;
    toolCallId: string;
    input: unknown;
  };
};

const parseApprovalParts = (content: unknown): ToolApprovalRequestPart[] => {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(
    (part): part is ToolApprovalRequestPart =>
      !!part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "tool-approval-request" &&
      typeof (part as { approvalId?: unknown }).approvalId === "string" &&
      !!(part as { toolCall?: unknown }).toolCall,
  );
};

export const hashProofPayload = (payload: string) =>
  createHash("sha256").update(payload).digest("hex");

export const registerApprovalRequests = async (input: {
  sessionId: string;
  content: unknown;
  correlationId: string;
}) => {
  const parts = parseApprovalParts(input.content);
  if (parts.length === 0) {
    return [];
  }

  const created = [];
  for (const part of parts) {
    const record = await createToolApproval({
      approvalId: part.approvalId,
      sessionId: input.sessionId,
      toolName: part.toolCall.toolName,
      toolCallId: part.toolCall.toolCallId,
      inputJson: part.toolCall.input,
      status: "requested",
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    });

    await enqueueApprovalTimeout({
      approvalId: part.approvalId,
      correlationId: input.correlationId,
      delayMs: APPROVAL_TTL_MS,
    });

    await appendAuditEvent({
      actorType: "system",
      actorId: "agent",
      eventType: "approval.requested",
      correlationId: input.correlationId,
      metadata: {
        approvalId: part.approvalId,
        toolName: part.toolCall.toolName,
        toolCallId: part.toolCall.toolCallId,
      },
    });
    created.push(record);
  }

  return created;
};

export const decideApproval = async (input: {
  approvalId: string;
  approved: boolean;
  decidedBy: string;
  correlationId: string;
  reason?: string;
}) => {
  const current = await getToolApproval(input.approvalId);
  if (!current) {
    return {
      ok: false,
      reason: "Approval not found.",
    };
  }

  if (current.status !== "requested") {
    return {
      ok: false,
      reason: `Approval already ${current.status}.`,
    };
  }

  if (current.expiresAt.getTime() < Date.now()) {
    await expirePendingApproval(current.approvalId);
    return {
      ok: false,
      reason: "Approval already expired.",
    };
  }

  const status = input.approved ? "approved" : "denied";
  await updateToolApprovalDecision({
    approvalId: input.approvalId,
    status,
    decidedBy: input.decidedBy,
    ...(input.reason ? { reason: input.reason } : {}),
  });

  await appendAuditEvent({
    actorType: "telegram_user",
    actorId: input.decidedBy,
    eventType: "approval.decided",
    correlationId: input.correlationId,
    metadata: {
      approvalId: input.approvalId,
      approved: input.approved,
      reason: input.reason ?? null,
    },
  });

  logger.info("Approval decision recorded.", {
    approvalId: input.approvalId,
    approved: input.approved,
  });

  return { ok: true, approval: current };
};

export const buildApprovalPromptText = (input: {
  approvalId: string;
  toolName: string;
  toolInput: unknown;
  expiresAt: Date;
}) =>
  [
    "Approval required for critical TON action.",
    `Approval ID: ${input.approvalId}`,
    `Tool: ${input.toolName}`,
    `Input: ${JSON.stringify(input.toolInput)}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "",
    "Use the provided buttons to approve or deny.",
  ].join("\n");
