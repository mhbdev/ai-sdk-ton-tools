import { gateway } from "@ai-sdk/gateway";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getEnv } from "@/config/env";

export type AgentModelProvider = "openrouter" | "ai-gateway";

export type AgentModelAttempt = {
  provider: AgentModelProvider;
  modelId: string;
  model: LanguageModel;
};

let cachedOpenRouter: ReturnType<typeof createOpenRouter> | null = null;

const getOpenRouterProvider = () => {
  if (!cachedOpenRouter) {
    const env = getEnv();
    cachedOpenRouter = createOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
    });
  }
  return cachedOpenRouter;
};

export const resolveGatewayFallbackModelId = (
  requestedModelId: string,
  configuredFallbackModelId?: string,
) => {
  if (!configuredFallbackModelId) {
    return requestedModelId;
  }

  const trimmed = configuredFallbackModelId.trim();
  return trimmed.length > 0 ? trimmed : requestedModelId;
};

export const buildAgentModelAttempts = (requestedModelId: string): AgentModelAttempt[] => {
  const env = getEnv();
  const openRouterModel = requestedModelId.trim().length > 0 ? requestedModelId.trim() : env.AI_MODEL;
  const gatewayModelId = resolveGatewayFallbackModelId(
    openRouterModel,
    env.AI_GATEWAY_FALLBACK_MODEL,
  );

  const attempts: AgentModelAttempt[] = [
    {
      provider: "openrouter",
      modelId: openRouterModel,
      model: getOpenRouterProvider()(openRouterModel),
    },
  ];

  if (env.AI_GATEWAY_API_KEY) {
    attempts.push({
      provider: "ai-gateway",
      modelId: gatewayModelId,
      model: gateway.languageModel(gatewayModelId),
    });
  }

  return attempts;
};
