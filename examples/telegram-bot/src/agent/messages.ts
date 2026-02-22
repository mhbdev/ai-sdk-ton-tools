import type { ModelMessage } from "ai";
import { getAgentMessagesBySession, saveAgentMessage } from "@/db/queries";

const isModelRole = (role: string): role is ModelMessage["role"] =>
  role === "system" || role === "user" || role === "assistant" || role === "tool";

export const loadConversationModelMessages = async (
  sessionId: string,
): Promise<ModelMessage[]> => {
  const rows = await getAgentMessagesBySession(sessionId);
  return rows
    .map((row) => {
      if (!isModelRole(row.role)) {
        return null;
      }

      return ({
        role: row.role,
        content: row.partsJson as ModelMessage["content"],
      } as ModelMessage);
    })
    .filter((row): row is ModelMessage => row !== null);
};

export const persistModelMessage = async (input: {
  sessionId: string;
  role: ModelMessage["role"];
  content: ModelMessage["content"];
  correlationId: string;
}) =>
  saveAgentMessage({
    sessionId: input.sessionId,
    role: input.role,
    partsJson: input.content,
    correlationId: input.correlationId,
  });

export const persistModelMessages = async (input: {
  sessionId: string;
  messages: ModelMessage[];
  correlationId: string;
}) => {
  for (const message of input.messages) {
    await persistModelMessage({
      sessionId: input.sessionId,
      role: message.role,
      content: message.content,
      correlationId: input.correlationId,
    });
  }
};

export const buildUserTextMessage = (text: string): ModelMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

export const buildApprovalResponseMessage = (input: {
  approvalId: string;
  approved: boolean;
  reason?: string;
}): ModelMessage => ({
  role: "tool",
  content: [
    {
      type: "tool-approval-response",
      approvalId: input.approvalId,
      approved: input.approved,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  ],
});
