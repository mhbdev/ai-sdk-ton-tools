import "server-only";

export type E2BMode = "cloud" | "self-hosted";

export type E2BSandboxStatus = {
  enabled: boolean;
  mode: E2BMode;
  reason?: string;
};

export type E2BSandboxConfig = E2BSandboxStatus & {
  apiKey?: string;
  accessToken?: string;
  domain?: string;
  apiUrl?: string;
  sandboxUrl?: string;
  template?: string;
  timeoutMs: number;
  requestTimeoutMs: number;
  debug: boolean;
};

const DEFAULT_SANDBOX_TIMEOUT_MS = 300_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1000;
const MAX_SANDBOX_TIMEOUT_MS = 86_400_000;
const MAX_REQUEST_TIMEOUT_MS = 600_000;
const URL_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const WHITESPACE_REGEX = /\s/;

let cachedConfig: E2BSandboxConfig | null = null;
let hasLoggedInvalidConfig = false;

const normalize = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseBoolean = (value?: string) => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseTimeoutMs = ({
  value,
  fallback,
  min,
  max,
}: {
  value?: string;
  fallback: number;
  min: number;
  max: number;
}) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }

  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

const looksLikeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const hasUrlScheme = (value: string) => URL_SCHEME_REGEX.test(value);
const looksLikeDomain = (value: string) =>
  !WHITESPACE_REGEX.test(value) && !value.includes("/") && !value.includes("@");

const resolveConfig = (): E2BSandboxConfig => {
  const apiKey = normalize(process.env.E2B_API_KEY);
  const accessToken = normalize(process.env.E2B_ACCESS_TOKEN);
  const domain = normalize(process.env.E2B_DOMAIN);
  const apiUrl = normalize(process.env.E2B_API_URL);
  const sandboxUrl = normalize(process.env.E2B_SANDBOX_URL);
  const template = normalize(process.env.E2B_TEMPLATE);
  const debug = parseBoolean(process.env.E2B_DEBUG);
  const selfHosted =
    parseBoolean(process.env.E2B_SELF_HOSTED) || Boolean(domain);
  const mode: E2BMode = selfHosted ? "self-hosted" : "cloud";

  const timeoutMs = parseTimeoutMs({
    value: normalize(process.env.E2B_SANDBOX_TIMEOUT_MS),
    fallback: DEFAULT_SANDBOX_TIMEOUT_MS,
    min: MIN_TIMEOUT_MS,
    max: MAX_SANDBOX_TIMEOUT_MS,
  });

  if (timeoutMs === null) {
    return {
      enabled: false,
      mode,
      reason: `E2B_SANDBOX_TIMEOUT_MS must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_SANDBOX_TIMEOUT_MS}.`,
      timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      debug,
    };
  }

  const requestTimeoutMs = parseTimeoutMs({
    value: normalize(process.env.E2B_REQUEST_TIMEOUT_MS),
    fallback: DEFAULT_REQUEST_TIMEOUT_MS,
    min: MIN_TIMEOUT_MS,
    max: MAX_REQUEST_TIMEOUT_MS,
  });

  if (requestTimeoutMs === null) {
    return {
      enabled: false,
      mode,
      reason: `E2B_REQUEST_TIMEOUT_MS must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_REQUEST_TIMEOUT_MS}.`,
      timeoutMs,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      debug,
    };
  }

  if (!apiKey && !accessToken) {
    return {
      enabled: false,
      mode,
      reason:
        "Set E2B_API_KEY or E2B_ACCESS_TOKEN to enable E2B sandbox tools.",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  if (selfHosted && !domain) {
    return {
      enabled: false,
      mode,
      reason: "E2B self-hosted mode requires E2B_DOMAIN.",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  if (domain && hasUrlScheme(domain)) {
    return {
      enabled: false,
      mode,
      reason:
        "E2B_DOMAIN must be a domain name without protocol (for example: e2b.example.com).",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  if (domain && !looksLikeDomain(domain)) {
    return {
      enabled: false,
      mode,
      reason:
        "E2B_DOMAIN must be a plain host name (for example: e2b.example.com).",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  if (apiUrl && !looksLikeUrl(apiUrl)) {
    return {
      enabled: false,
      mode,
      reason: "E2B_API_URL must be a valid absolute http/https URL.",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  if (sandboxUrl && !looksLikeUrl(sandboxUrl)) {
    return {
      enabled: false,
      mode,
      reason: "E2B_SANDBOX_URL must be a valid absolute http/https URL.",
      timeoutMs,
      requestTimeoutMs,
      debug,
    };
  }

  return {
    enabled: true,
    mode,
    apiKey,
    accessToken,
    domain,
    apiUrl,
    sandboxUrl,
    template,
    timeoutMs,
    requestTimeoutMs,
    debug,
  };
};

export const getE2BSandboxConfig = (): E2BSandboxConfig => {
  if (!cachedConfig) {
    cachedConfig = resolveConfig();
  }

  return cachedConfig;
};

export const getE2BSandboxStatus = (): E2BSandboxStatus => {
  const { enabled, mode, reason } = getE2BSandboxConfig();
  return { enabled, mode, reason };
};

export const logE2BConfigWarningOnce = () => {
  const config = getE2BSandboxConfig();
  if (config.enabled || hasLoggedInvalidConfig) {
    return;
  }

  console.warn(`[E2B] ${config.reason ?? "Sandbox tools are disabled."}`);
  hasLoggedInvalidConfig = true;
};
