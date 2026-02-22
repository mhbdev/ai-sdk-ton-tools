import { ToolLoopAgent, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import {
  buildApprovalResponseMessage,
  buildUserTextMessage,
  loadConversationModelMessages,
  persistModelMessage,
  persistModelMessages,
} from "@/agent/messages";
import { buildPolicyWrappedTonTools } from "@/agent/tool-policy";
import { registerApprovalRequests } from "@/approvals/service";
import { getEnv } from "@/config/env";
import { appendAuditEvent } from "@/db/queries/audit";
import { logger } from "@/observability/logger";
import {
  buildAgentModelAttempts,
  type AgentModelProvider,
} from "@/agent/model-provider";
import type { TurnExecutionRequest } from "@/types/contracts";

type TurnExecutionResult = {
  responseText: string;
  approvals: Array<{
    approvalId: string;
    toolName: string;
    toolCallId: string;
    expiresAt: Date;
    inputJson: unknown;
  }>;
};

type AgentProviderExecutionResult = {
  provider: AgentModelProvider;
  modelId: string;
  result: Awaited<ReturnType<ToolLoopAgent["generate"]>>;
  usedFallback: boolean;
  primaryErrorMessage?: string;
};

const buildSystemPrompt = (input: {
  network: "mainnet" | "testnet";
  chatType: string;
  walletAddress?: string;
}) =>
  [
    "You are a production TON assistant in Telegram.",
    "Use tools for factual blockchain answers.",
    "Be concise and explicit with risk for all value movement.",
    "Never request or store user private keys or seed phrases.",
    `Current network: ${input.network}`,
    `Chat type: ${input.chatType}`,
    input.walletAddress
      ? `Linked wallet address: ${input.walletAddress}`
      : "No linked wallet address.",
    "If an operation requires approval, wait for tool approval flow and do not retry denied actions.",
  ].join("\n");

const collectToolApprovalParts = (messages: ModelMessage[]) => {
  const toolCallsById = new Map<string, { toolName: string; input: unknown }>();
  const approvalRequests: Array<{ approvalId: string; toolCallId: string }> = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part.type === "tool-call") {
        toolCallsById.set(part.toolCallId, {
          toolName: part.toolName,
          input: part.input,
        });
        continue;
      }

      if (part.type === "tool-approval-request") {
        approvalRequests.push({
          approvalId: part.approvalId,
          toolCallId: part.toolCallId,
        });
      }
    }
  }

  return approvalRequests
    .map((approvalRequest) => {
      const toolCall = toolCallsById.get(approvalRequest.toolCallId);
      if (!toolCall) {
        return null;
      }
      return {
        approvalId: approvalRequest.approvalId,
        toolName: toolCall.toolName,
        toolCallId: approvalRequest.toolCallId,
        input: toolCall.input,
      };
    })
    .filter(
      (
        item,
      ): item is {
        approvalId: string;
        toolName: string;
        toolCallId: string;
        input: unknown;
      } => item !== null,
    );
};

const executeWithProviderFallback = async (input: {
  request: TurnExecutionRequest;
  modelMessages: ModelMessage[];
  tools: ToolSet;
  env: ReturnType<typeof getEnv>;
}): Promise<AgentProviderExecutionResult> => {
  const attempts = buildAgentModelAttempts(input.request.modelId);
  let primaryError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt) {
      continue;
    }

    const agent = new ToolLoopAgent({
      id: "telegram-ton-agent",
      model: attempt.model,
      instructions: buildSystemPrompt({
        network: input.request.network,
        chatType: input.request.chatType,
        ...(input.request.walletAddress
          ? { walletAddress: input.request.walletAddress }
          : {}),
      }),
      tools: input.tools,
      stopWhen: stepCountIs(20),
      experimental_telemetry: {
        isEnabled: input.env.NODE_ENV === "production",
        functionId: "telegram-ton-agent-turn",
        metadata: {
          sessionId: input.request.sessionId,
          correlationId: input.request.correlationId,
          provider: attempt.provider,
          modelId: attempt.modelId,
        },
      },
    });

    try {
      const result = await agent.generate({
        messages: input.modelMessages,
      });

      return {
        provider: attempt.provider,
        modelId: attempt.modelId,
        result,
        usedFallback: index > 0,
        ...(primaryError
          ? {
              primaryErrorMessage:
                primaryError instanceof Error
                  ? primaryError.message
                  : String(primaryError),
            }
          : {}),
      };
    } catch (error) {
      if (index === 0) {
        primaryError = error;
        logger.warn("Primary model provider failed; switching to fallback provider.", {
          correlationId: input.request.correlationId,
          provider: attempt.provider,
          modelId: attempt.modelId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      logger.error("Fallback model provider failed after primary failure.", {
        correlationId: input.request.correlationId,
        provider: attempt.provider,
        modelId: attempt.modelId,
        primaryError:
          primaryError instanceof Error ? primaryError.message : String(primaryError),
        fallbackError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  if (primaryError instanceof Error) {
    throw primaryError;
  }
  if (primaryError) {
    throw new Error(String(primaryError));
  }
  throw new Error("No model provider attempts were available.");
};

export const executeAgentTurn = async (
  request: TurnExecutionRequest,
): Promise<TurnExecutionResult> => {
  const env = getEnv();
  const tools = buildPolicyWrappedTonTools({
    apiKey: env.TONAPI_API_KEY,
    network: request.network,
    chatType: request.chatType,
  });

  const history = await loadConversationModelMessages(request.sessionId);
  const incoming = request.approvalResponse
    ? buildApprovalResponseMessage({
        approvalId: request.approvalResponse.approvalId,
        approved: request.approvalResponse.approved,
        ...(request.approvalResponse.reason
          ? { reason: request.approvalResponse.reason }
          : {}),
      })
    : buildUserTextMessage(request.text);

  await persistModelMessage({
    sessionId: request.sessionId,
    role: incoming.role,
    content: incoming.content,
    correlationId: request.correlationId,
  });

  const modelMessages = [...history, incoming];
  const providerExecution = await executeWithProviderFallback({
    request,
    modelMessages,
    tools,
    env,
  });
  const result = providerExecution.result;

  const responseMessages = Array.isArray(result.response?.messages)
    ? (result.response.messages as ModelMessage[])
    : [];

  if (responseMessages.length > 0) {
    await persistModelMessages({
      sessionId: request.sessionId,
      messages: responseMessages,
      correlationId: request.correlationId,
    });
  }

  const approvalParts = collectToolApprovalParts(responseMessages);
  const approvals = await registerApprovalRequests({
    sessionId: request.sessionId,
    content: approvalParts.map((part) => ({
      type: "tool-approval-request" as const,
      approvalId: part.approvalId,
      toolCall: {
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        input: part.input,
      },
    })),
    correlationId: request.correlationId,
  });

  if (providerExecution.usedFallback) {
    await appendAuditEvent({
      actorType: "system",
      actorId: "agent",
      eventType: "agent.turn.provider.fallback",
      correlationId: request.correlationId,
      metadata: {
        sessionId: request.sessionId,
        primaryProvider: "openrouter",
        fallbackProvider: providerExecution.provider,
        fallbackModelId: providerExecution.modelId,
        primaryError: providerExecution.primaryErrorMessage ?? "unknown",
      },
    });
  }

  await appendAuditEvent({
    actorType: "system",
    actorId: "agent",
    eventType: "agent.turn.completed",
    correlationId: request.correlationId,
    metadata: {
      sessionId: request.sessionId,
      hasApprovals: approvals.length > 0,
      textLength: result.text?.length ?? 0,
      provider: providerExecution.provider,
      modelId: providerExecution.modelId,
      usedFallback: providerExecution.usedFallback,
    },
  });

  logger.info("Agent turn executed.", {
    correlationId: request.correlationId,
    approvals: approvals.length,
    provider: providerExecution.provider,
    modelId: providerExecution.modelId,
    usedFallback: providerExecution.usedFallback,
  });

  const approvalSummary =
    approvals.length > 0
      ? "\n\nApproval pending for critical operation. Use the approval buttons in chat."
      : "";

  return {
    responseText:
      result.text?.trim().length
        ? `${result.text}${approvalSummary}`
        : approvals.length > 0
          ? "Action paused pending your approval."
          : "Done.",
    approvals: approvals.map((item) => ({
      approvalId: item.approvalId,
      toolName: item.toolName,
      toolCallId: item.toolCallId,
      expiresAt: item.expiresAt,
      inputJson: item.inputJson,
    })),
  };
};
