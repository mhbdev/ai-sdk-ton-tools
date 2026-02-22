import { redactForLogs } from "@/security/redaction";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLogLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? "info";

const shouldLog = (level: LogLevel) =>
  LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[currentLogLevel];

const emit = (level: LogLevel, message: string, metadata?: unknown) => {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(metadata !== undefined ? { metadata: redactForLogs(metadata) } : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

export const logger = {
  debug: (message: string, metadata?: unknown) =>
    emit("debug", message, metadata),
  info: (message: string, metadata?: unknown) => emit("info", message, metadata),
  warn: (message: string, metadata?: unknown) => emit("warn", message, metadata),
  error: (message: string, metadata?: unknown) =>
    emit("error", message, metadata),
};

