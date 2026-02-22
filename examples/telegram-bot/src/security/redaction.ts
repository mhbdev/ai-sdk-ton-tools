const REDACTION_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  preservePrefix: boolean;
}> = [
  {
    regex: /(bot_token=)([^&\s]+)/gi,
    preservePrefix: true,
  },
  {
    regex: /(Bearer\s+)([A-Za-z0-9\-_\.]+)/gi,
    preservePrefix: true,
  },
  {
    regex: /([A-Za-z0-9+/]{32,}={0,2})/g,
    preservePrefix: false,
  },
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
  REDACTION_PATTERNS.reduce((acc, pattern) => {
    return acc.replace(pattern.regex, (...matchArgs) => {
      if (!pattern.preservePrefix) {
        return "[REDACTED]";
      }

      const prefix = matchArgs[1];
      if (typeof prefix !== "string") {
        return "[REDACTED]";
      }

      return `${prefix}[REDACTED]`;
    });
  }, value);

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
