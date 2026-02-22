const REDACTION_PATTERNS: Array<RegExp> = [
  /(bot_token=)([^&\s]+)/gi,
  /(Bearer\s+)([A-Za-z0-9\-_\.]+)/gi,
  /([A-Za-z0-9+/]{32,}={0,2})/g,
];

const SENSITIVE_KEYS = new Set([
  "token",
  "apiKey",
  "authorization",
  "secret",
  "signature",
  "mnemonic",
  "secretKey",
  "privateKey",
  "proof",
  "payload",
  "ENCRYPTION_MASTER_KEY",
]);

const redactString = (value: string) =>
  REDACTION_PATTERNS.reduce(
    (acc, regex) => acc.replace(regex, (_match, prefix) => `${prefix}[REDACTED]`),
    value,
  );

const redactUnknown = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => {
        if (SENSITIVE_KEYS.has(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redactUnknown(nested)];
      },
    );
    return Object.fromEntries(entries);
  }

  return value;
};

export const redactForLogs = <T>(value: T): T => redactUnknown(value) as T;

