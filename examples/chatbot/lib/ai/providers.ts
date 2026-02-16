import { createAnthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";
import { getProviderFromModelId, getProviderModelId } from "./model-utils";

const THINKING_SUFFIX_REGEX = /-thinking$/;
const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
};

const getProviderModel = ({
  provider,
  providerModelId,
  apiKey,
}: {
  provider: string;
  providerModelId: string;
  apiKey?: string;
}) => {
  if (!apiKey) {
    return null;
  }
  const normalizedModelId = providerModelId.startsWith(`${provider}/`)
    ? providerModelId.slice(provider.length + 1)
    : providerModelId;
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(normalizedModelId);
    case "anthropic":
      return createAnthropic({ apiKey })(normalizedModelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(normalizedModelId);
    case "xai":
      return createXai({ apiKey })(normalizedModelId);
    default:
      return null;
  }
};

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

export function getLanguageModel(
  modelId: string,
  options?: { apiKey?: string }
) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");
  const normalizedModelId = isReasoningModel
    ? modelId.replace(THINKING_SUFFIX_REGEX, "")
    : modelId;
  const userApiKey = options?.apiKey?.trim();

  const provider = getProviderFromModelId(normalizedModelId);
  const providerModelId = getProviderModelId(normalizedModelId);
  const envApiKey =
    provider !== "unknown"
      ? process.env[PROVIDER_ENV_KEYS[provider]]
      : undefined;
  const providerApiKey = userApiKey || envApiKey;

  const providerModel =
    provider === "unknown"
      ? null
      : getProviderModel({
          provider,
          providerModelId,
          apiKey: providerApiKey,
        });

  const baseModel = providerModel ?? gateway.languageModel(normalizedModelId);

  if (isReasoningModel) {
    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return baseModel;
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  const model = getProviderModel({
    provider: "google",
    providerModelId: "gemini-2.5-flash-lite",
    apiKey: process.env.GOOGLE_API_KEY,
  });
  return model ?? gateway.languageModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  const model = getProviderModel({
    provider: "google",
    providerModelId: "gemini-2.5-flash-lite",
    apiKey: process.env.GOOGLE_API_KEY,
  });
  return model ?? gateway.languageModel("gemini-2.5-flash-lite");
}
