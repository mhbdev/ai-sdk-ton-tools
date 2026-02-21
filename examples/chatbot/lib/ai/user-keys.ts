import {
  getProviderFromModelId,
  SUPPORTED_PROVIDERS,
  type SupportedProvider,
} from "./model-utils";

export type ProviderKeyMap = Partial<Record<SupportedProvider, string>>;

export const PROVIDER_KEYS_STORAGE_KEY = "ai-sdk-provider-keys";

export const normalizeProviderKeyMap = (input: Record<string, unknown>) => {
  const normalized: ProviderKeyMap = {};

  for (const provider of SUPPORTED_PROVIDERS) {
    const value = input[provider];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        normalized[provider] = trimmed;
      }
    }
  }

  return normalized;
};

export function loadProviderKeys(): ProviderKeyMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(PROVIDER_KEYS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return normalizeProviderKeyMap(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function saveProviderKeys(keys: ProviderKeyMap): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeProviderKeyMap(keys as Record<string, unknown>);
  localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(normalized));
}

export function getProviderKeyForModel(modelId: string): string | undefined {
  const provider = getProviderFromModelId(modelId);
  if (provider === "unknown") {
    return;
  }

  const keys = loadProviderKeys();
  return keys[provider];
}
