import { assessApproval } from "@/approvals/risk-policy";
import type { ApprovalRiskLevel, RiskProfile } from "@/types/contracts";

type ApprovalCardStatus = "requested" | "approved" | "denied" | "expired" | "failed";

type RenderApprovalInput = {
  approvalId: string;
  toolName: string;
  inputJson: unknown;
  expiresAt: Date;
  riskProfile: RiskProfile;
  status: ApprovalCardStatus;
  decidedAt?: Date | null;
  decidedBy?: string | null;
  now?: Date;
};

const formatTon = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "Unknown";
  }

  if (value >= 1) {
    return `${value.toFixed(4)} TON`;
  }
  if (value >= 0.001) {
    return `${value.toFixed(6)} TON`;
  }
  return `${value.toExponential(2)} TON`;
};

const formatRemaining = (expiresAt: Date, now: Date) => {
  const totalSeconds = Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const formatStatus = (status: ApprovalCardStatus) => {
  switch (status) {
    case "requested":
      return "Pending Approval";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "failed":
      return "Failed";
  }
};

const formatRisk = (risk: ApprovalRiskLevel) => {
  switch (risk) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "critical":
      return "Critical";
  }
};

const toolTitle = (toolName: string) => {
  switch (toolName) {
    case "tonSendBlockchainMessage":
      return "Send TON Transaction";
    case "tonSendBlockchainMessageBatch":
      return "Batch TON Transfer";
    case "tonBuildAndSendExternalMessage":
      return "Broadcast External Message";
    case "tonTonConnectProof":
      return "Wallet Ownership Proof";
    default:
      return "TON Action Approval";
  }
};

const toolSummary = (toolName: string) => {
  switch (toolName) {
    case "tonSendBlockchainMessage":
      return "This action sends a blockchain message that may move funds.";
    case "tonSendBlockchainMessageBatch":
      return "This action sends multiple blockchain messages in a single flow.";
    case "tonBuildAndSendExternalMessage":
      return "This action signs and broadcasts an external message to the chain.";
    case "tonTonConnectProof":
      return "This action verifies wallet ownership proof for account linking.";
    default:
      return "This action executes a blockchain operation using your current session.";
  }
};

export const requiresAdditionalCautiousConfirmation = (input: {
  riskProfile: RiskProfile;
  riskLevel: ApprovalRiskLevel;
}) =>
  input.riskProfile === "cautious" &&
  (input.riskLevel === "high" || input.riskLevel === "critical");

export const renderApprovalCardText = (input: RenderApprovalInput) => {
  const now = input.now ?? new Date();
  const assessment = assessApproval({
    toolName: input.toolName,
    toolInput: input.inputJson,
    riskProfile: input.riskProfile,
  });
  const status = formatStatus(input.status);
  const risk = formatRisk(assessment.level);
  const expiresLine =
    input.status === "requested"
      ? `${input.expiresAt.toISOString()} (${formatRemaining(input.expiresAt, now)} left)`
      : input.expiresAt.toISOString();

  const lines = [
    `${status}: ${toolTitle(input.toolName)}`,
    `Approval ID: ${input.approvalId}`,
    `Risk Level: ${risk}`,
    `Estimated Value: ${formatTon(assessment.valueTon)} (confidence: ${assessment.confidence})`,
    `Estimated Gas: ${formatTon(assessment.gasTon)} (confidence: ${assessment.confidence})`,
    `Expires: ${expiresLine}`,
    "",
    "What this does:",
    toolSummary(input.toolName),
    "",
    `Profile: ${input.riskProfile}`,
  ];

  if (requiresAdditionalCautiousConfirmation({
    riskProfile: input.riskProfile,
    riskLevel: assessment.level,
  })) {
    lines.push(
      "Cautious mode: high-risk approvals require a second Approve tap.",
    );
  }

  if (input.status !== "requested") {
    const decidedLine = input.decidedAt
      ? `Resolved At: ${input.decidedAt.toISOString()}`
      : null;
    const decidedByLine =
      input.decidedBy && input.decidedBy.length > 0
        ? `Resolved By: ${input.decidedBy}`
        : null;
    if (decidedLine) {
      lines.push("", decidedLine);
    }
    if (decidedByLine) {
      lines.push(decidedByLine);
    }
  }

  return {
    text: lines.join("\n"),
    riskLevel: assessment.level,
    cautiousRequiresSecondTap: requiresAdditionalCautiousConfirmation({
      riskProfile: input.riskProfile,
      riskLevel: assessment.level,
    }),
  };
};

export const renderApprovalDetailsText = (input: RenderApprovalInput) => {
  const assessment = assessApproval({
    toolName: input.toolName,
    toolInput: input.inputJson,
    riskProfile: input.riskProfile,
  });

  const detailLines = [
    `Details: ${toolTitle(input.toolName)}`,
    `Approval ID: ${input.approvalId}`,
    `Risk Level: ${formatRisk(assessment.level)}`,
    "",
    "Risk reasoning:",
    ...assessment.reasons.map((reason) => `- ${reason}`),
    "",
    `Estimated Value: ${formatTon(assessment.valueTon)}`,
    `Estimated Gas: ${formatTon(assessment.gasTon)}`,
    `Estimate Confidence: ${assessment.confidence}`,
    `Expires At: ${input.expiresAt.toISOString()}`,
  ];

  return {
    text: detailLines.join("\n"),
    riskLevel: assessment.level,
  };
};
