export const SUPPORTED_PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "xai",
] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function getProviderFromModelId(modelId: string):
  | SupportedProvider
  | "unknown" {
  const provider = modelId.split("/")[0]?.toLowerCase();
  if (
    provider &&
    SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)
  ) {
    return provider as SupportedProvider;
  }
  return "unknown";
}

export function getProviderModelId(modelId: string): string {
  const parts = modelId.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}
