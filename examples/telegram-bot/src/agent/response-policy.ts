import type { ModelMessage } from "ai";

const APPROVAL_PENDING_SUFFIX =
  "\n\nApproval pending for critical operation. Use the approval buttons in chat.";
const NEXT_APPROVAL_PENDING_SUFFIX =
  "\n\nAnother protected action is pending approval. Use the approval buttons in chat.";

const PLAIN_TEXT_APPROVAL_PATTERNS = [
  /\bdo you approve\b/i,
  /\bneed your explicit approval\b/i,
  /\bapproval required\b/i,
  /\bapprove this transaction\b/i,
  /\bpending your approval\b/i,
];

type ToolResultPart = {
  toolName: string;
  toolCallId: string;
  output: unknown;
};

type ResolvedTurnResponse = {
  text: string;
  forcedApprovedStatus: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asNonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const hasPlainTextApprovalRequest = (text: string) =>
  PLAIN_TEXT_APPROVAL_PATTERNS.some((pattern) => pattern.test(text));

const extractJsonOutputValue = (output: unknown): Record<string, unknown> | null => {
  if (!isRecord(output)) {
    return null;
  }

  if (output.type !== "json") {
    return null;
  }

  if (!isRecord(output.value)) {
    return null;
  }

  return output.value;
};

const summarizeToolResult = (part: ToolResultPart) => {
  const jsonValue = extractJsonOutputValue(part.output);
  if (!jsonValue) {
    return `Executed ${part.toolName} (call ${part.toolCallId}).`;
  }

  const destination = asNonEmptyString(jsonValue.destination);
  const hash = asNonEmptyString(jsonValue.hash);

  const details: string[] = [];
  if (destination) {
    details.push(`destination ${destination}`);
  }
  if (hash) {
    details.push(`hash ${hash}`);
  }

  if (details.length === 0) {
    return `Executed ${part.toolName} (call ${part.toolCallId}).`;
  }

  return `Executed ${part.toolName} (${details.join(", ")}).`;
};

const buildApprovedExecutionStatusText = (toolResults: ToolResultPart[]) => {
  if (toolResults.length === 0) {
    return "Approval received. Protected action executed.";
  }

  const lines = [
    "Approval received. Protected action executed with the following result:",
    ...toolResults.map((part) => `- ${summarizeToolResult(part)}`),
  ];

  return lines.join("\n");
};

export const collectToolResultParts = (messages: ModelMessage[]): ToolResultPart[] => {
  const toolResults: ToolResultPart[] = [];

  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part.type !== "tool-result") {
        continue;
      }

      toolResults.push({
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        output: part.output,
      });
    }
  }

  return toolResults;
};

export const resolveTurnResponseText = (input: {
  rawText: string | undefined;
  approvalsCount: number;
  approvalWasGranted: boolean;
  toolResults: ToolResultPart[];
}): ResolvedTurnResponse => {
  const text = input.rawText?.trim() ?? "";
  const hasPendingApprovals = input.approvalsCount > 0;
  const shouldForceApprovedStatus =
    input.approvalWasGranted &&
    (text.length === 0 || hasPlainTextApprovalRequest(text));

  if (shouldForceApprovedStatus) {
    const statusText = buildApprovedExecutionStatusText(input.toolResults);
    return {
      text: hasPendingApprovals
        ? `${statusText}${NEXT_APPROVAL_PENDING_SUFFIX}`
        : statusText,
      forcedApprovedStatus: true,
    };
  }

  if (text.length > 0) {
    return {
      text: hasPendingApprovals ? `${text}${APPROVAL_PENDING_SUFFIX}` : text,
      forcedApprovedStatus: false,
    };
  }

  return {
    text: hasPendingApprovals ? "Action paused pending your approval." : "Done.",
    forcedApprovedStatus: false,
  };
};
