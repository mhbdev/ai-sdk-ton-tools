import { createHash, randomBytes } from "node:crypto";
import { renderApprovalCardText } from "@/approvals/presenter";
import {
  createToolApproval,
  getToolApprovalByCallbackToken,
  expirePendingApproval,
  getToolApproval,
  updateToolApprovalDecision,
} from "@/db/queries";
import { appendAuditEvent } from "@/db/queries/audit";
import { logger } from "@/observability/logger";
import { enqueueApprovalCountdown, enqueueApprovalTimeout } from "@/queue/queues";
import type { RiskProfile } from "@/types/contracts";

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const APPROVAL_COUNTDOWN_INTERVAL_MS = 30_000;

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

const createApprovalCallbackToken = () =>
  randomBytes(7).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 14);

export const registerApprovalRequests = async (input: {
  sessionId: string;
  content: unknown;
  correlationId: string;
  telegramChatId: string;
  messageThreadId?: number;
  riskProfile: RiskProfile;
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
      callbackToken: createApprovalCallbackToken(),
      telegramChatId: input.telegramChatId,
      ...(typeof input.messageThreadId === "number"
        ? { messageThreadId: input.messageThreadId }
        : { messageThreadId: null }),
      promptMessageId: null,
      riskProfile: input.riskProfile,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    });

    await enqueueApprovalTimeout({
      approvalId: part.approvalId,
      correlationId: input.correlationId,
      delayMs: APPROVAL_TTL_MS,
    });
    await enqueueApprovalCountdown({
      approvalId: part.approvalId,
      correlationId: input.correlationId,
      delayMs: APPROVAL_COUNTDOWN_INTERVAL_MS,
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
        callbackToken: record.callbackToken,
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
  const updated = await updateToolApprovalDecision({
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

  return { ok: true, approval: updated ?? current };
};

export const getApprovalFromCallbackToken = async (callbackToken: string) =>
  getToolApprovalByCallbackToken(callbackToken);

export const buildApprovalPromptText = (input: {
  approvalId: string;
  toolName: string;
  toolInput: unknown;
  expiresAt: Date;
  riskProfile?: RiskProfile;
  status?: "requested" | "approved" | "denied" | "expired" | "failed";
}) =>
  renderApprovalCardText({
    approvalId: input.approvalId,
    toolName: input.toolName,
    inputJson: input.toolInput,
    expiresAt: input.expiresAt,
    riskProfile: input.riskProfile ?? "balanced",
    status: input.status ?? "requested",
  }).text;
