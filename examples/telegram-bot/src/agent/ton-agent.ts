import { ToolLoopAgent, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import {
  buildApprovalResponseMessage,
  buildUserTextMessage,
  loadConversationModelMessages,
  persistModelMessage,
  persistModelMessages,
} from "@/agent/messages";
import {
  collectToolResultParts,
  resolveTurnResponseText,
} from "@/agent/response-policy";
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
    callbackToken: string;
    toolName: string;
    toolCallId: string;
    riskProfile: "cautious" | "balanced" | "advanced";
    expiresAt: Date;
    inputJson: unknown;
  }>;
};

type TurnExecutionCallbacks = {
  onTextDelta?: (delta: string) => void | Promise<void>;
};

type AgentProviderExecutionResult = {
  provider: AgentModelProvider;
  modelId: string;
  toolChoice: "auto" | "required";
  responseText: string;
  responseMessages: ModelMessage[];
  usedFallback: boolean;
  primaryErrorMessage?: string;
};

const FRIENDLY_TON_ADDRESS_PATTERN =
  /\b(?:EQ|UQ|kQ|0Q|Ef|Uf|kf|0f)[A-Za-z0-9_-]{46,}\b/;
const RAW_TON_ADDRESS_PATTERN = /\b-?\d:[0-9a-fA-F]{64}\b/;

const requestContainsTonAddress = (text: string) =>
  FRIENDLY_TON_ADDRESS_PATTERN.test(text) || RAW_TON_ADDRESS_PATTERN.test(text);

const resolveAgentToolChoice = (request: TurnExecutionRequest) => {
  if (request.approvalResponse) {
    return "auto" as const;
  }

  if (requestContainsTonAddress(request.text)) {
    return "required" as const;
  }

  return "auto" as const;
};

const buildSystemPrompt = (input: {
  network: "mainnet" | "testnet";
  chatType: string;
  walletAddress?: string;
  responseStyle: "concise" | "detailed";
  riskProfile: "cautious" | "balanced" | "advanced";
}) =>
  [
    "You are a production TON assistant in Telegram.",
    "Use tools for factual blockchain answers.",
    "Never claim an address is invalid unless a tool call (for example tonAddressParse) explicitly fails.",
    "TON user-friendly addresses can start with EQ or UQ and may still be valid.",
    "If the user asks for DNS data for an address, use tonFindAddressDnsItems (or tonGetAccountDomains) instead of domain-resolve tools.",
    "Be concise and explicit with risk for all value movement.",
    "Never request or store user private keys or seed phrases.",
    `Current network: ${input.network}`,
    `Chat type: ${input.chatType}`,
    input.walletAddress
      ? `Linked wallet address: ${input.walletAddress}`
      : "No linked wallet address.",
    "If an operation requires approval, wait for tool approval flow and do not retry denied actions.",
    "After an approved callback, execute the approved action and return execution status.",
    "Never ask for approval in plain text. Approval requests must only be emitted via tool-approval-request.",
    input.responseStyle === "concise"
      ? "Response style: concise. Keep answers short and action-focused."
      : "Response style: detailed. Include rationale, caveats, and concise next steps.",
    input.riskProfile === "cautious"
      ? "Risk profile: cautious. Prefer explicit warnings and conservative guidance for value movement."
      : input.riskProfile === "advanced"
        ? "Risk profile: advanced. Assume technical user context; keep risk language compact but accurate."
        : "Risk profile: balanced. Provide practical warnings without overloading the response.",
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

const emitTextDelta = (
  callback: TurnExecutionCallbacks["onTextDelta"],
  delta: string,
  correlationId: string,
) => {
  if (!callback || delta.length === 0) {
    return;
  }

  try {
    void Promise.resolve(callback(delta)).catch((error) => {
      logger.debug("onTextDelta callback failed; continuing stream.", {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } catch (error) {
    logger.debug("onTextDelta callback threw synchronously; continuing stream.", {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const executeWithProviderFallback = async (input: {
  request: TurnExecutionRequest;
  modelMessages: ModelMessage[];
  tools: ToolSet;
  env: ReturnType<typeof getEnv>;
  callbacks?: TurnExecutionCallbacks;
}): Promise<AgentProviderExecutionResult> => {
  const attempts = buildAgentModelAttempts(input.request.modelId);
  const hasFallbackAttempt = attempts.length > 1;
  const toolChoice = resolveAgentToolChoice(input.request);
  let primaryError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt) {
      continue;
    }
    let emittedAnyDelta = false;

    const agent = new ToolLoopAgent({
      id: "telegram-ton-agent",
      model: attempt.model,
      instructions: buildSystemPrompt({
        network: input.request.network,
        chatType: input.request.chatType,
        responseStyle: input.request.responseStyle,
        riskProfile: input.request.riskProfile,
        ...(input.request.walletAddress
          ? { walletAddress: input.request.walletAddress }
          : {}),
      }),
      tools: input.tools,
      toolChoice,
      stopWhen: stepCountIs(20),
      experimental_telemetry: {
        isEnabled: input.env.NODE_ENV === "production",
        functionId: "telegram-ton-agent-turn",
        metadata: {
          sessionId: input.request.sessionId,
          correlationId: input.request.correlationId,
          provider: attempt.provider,
          modelId: attempt.modelId,
          toolChoice,
        },
      },
    });

    try {
      const streamResult = await agent.stream({
        messages: input.modelMessages,
      });
      let streamedText = "";

      for await (const chunk of streamResult.fullStream) {
        if (chunk.type !== "text-delta" || chunk.text.length === 0) {
          continue;
        }
        emittedAnyDelta = true;
        streamedText += chunk.text;
        emitTextDelta(
          input.callbacks?.onTextDelta,
          chunk.text,
          input.request.correlationId,
        );
      }

      const [streamText, streamResponse] = await Promise.all([
        streamResult.text,
        streamResult.response,
      ]);
      const normalizedText =
        streamText.trim().length > 0 ? streamText : streamedText;
      const responseMessages = Array.isArray(streamResponse.messages)
        ? (streamResponse.messages as ModelMessage[])
        : [];

      return {
        provider: attempt.provider,
        modelId: attempt.modelId,
        toolChoice,
        responseText: normalizedText,
        responseMessages,
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
        if (hasFallbackAttempt) {
          if (emittedAnyDelta) {
            logger.error("Primary stream failed after partial tokens; fallback suppressed.", {
              correlationId: input.request.correlationId,
              provider: attempt.provider,
              modelId: attempt.modelId,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
          logger.warn("Primary model provider stream failed; switching to fallback provider.", {
            correlationId: input.request.correlationId,
            provider: attempt.provider,
            modelId: attempt.modelId,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }

        logger.error("Primary model provider stream failed and fallback is not configured.", {
          correlationId: input.request.correlationId,
          provider: attempt.provider,
          modelId: attempt.modelId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      logger.error("Fallback model provider stream failed after primary failure.", {
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
  callbacks?: TurnExecutionCallbacks,
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
    ...(callbacks ? { callbacks } : {}),
  });
  const responseMessages = providerExecution.responseMessages;

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
    telegramChatId: String(request.telegramChatId),
    ...(typeof request.messageThreadId === "number"
      ? { messageThreadId: request.messageThreadId }
      : {}),
    riskProfile: request.riskProfile,
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
        toolChoice: providerExecution.toolChoice,
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
      textLength: providerExecution.responseText.length,
      provider: providerExecution.provider,
      modelId: providerExecution.modelId,
      usedFallback: providerExecution.usedFallback,
      toolChoice: providerExecution.toolChoice,
    },
  });

  logger.info("Agent turn executed.", {
    correlationId: request.correlationId,
    approvals: approvals.length,
    provider: providerExecution.provider,
    modelId: providerExecution.modelId,
    usedFallback: providerExecution.usedFallback,
    toolChoice: providerExecution.toolChoice,
  });

  const toolResults = collectToolResultParts(responseMessages);
  const resolvedResponse = resolveTurnResponseText({
    rawText: providerExecution.responseText,
    ...(request.text ? { userRequestText: request.text } : {}),
    approvalsCount: approvals.length,
    approvalWasGranted: request.approvalResponse?.approved === true,
    toolResults,
  });

  if (resolvedResponse.forcedApprovedStatus) {
    logger.warn("Blocked plain-text approval re-ask after approved callback.", {
      correlationId: request.correlationId,
      sessionId: request.sessionId,
      provider: providerExecution.provider,
      modelId: providerExecution.modelId,
    });

    await appendAuditEvent({
      actorType: "system",
      actorId: "agent",
      eventType: "agent.turn.approval.reask_blocked",
      correlationId: request.correlationId,
      metadata: {
        sessionId: request.sessionId,
        approvals: approvals.length,
        provider: providerExecution.provider,
        modelId: providerExecution.modelId,
      },
    });
  }

  return {
    responseText: resolvedResponse.text,
    approvals: approvals.map((item) => ({
      approvalId: item.approvalId,
      callbackToken: item.callbackToken,
      toolName: item.toolName,
      toolCallId: item.toolCallId,
      riskProfile: item.riskProfile,
      expiresAt: item.expiresAt,
      inputJson: item.inputJson,
    })),
  };
};
