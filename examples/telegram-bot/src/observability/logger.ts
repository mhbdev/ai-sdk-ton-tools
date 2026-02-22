import { redactForLogs } from "@/security/redaction";
import pino, { type LevelWithSilent, type Logger as PinoLogger } from "pino";

type LogMethod = "debug" | "info" | "warn" | "error";

const SUPPORTED_LOG_LEVELS: ReadonlyArray<LevelWithSilent> = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
];

const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const asLogLevel = (value: string | undefined): LevelWithSilent => {
  const normalized = value?.trim().toLowerCase();
  if (normalized && SUPPORTED_LOG_LEVELS.includes(normalized as LevelWithSilent)) {
    return normalized as LevelWithSilent;
  }
  return "info";
};

const isTruthy = (value: string | undefined) =>
  value ? BOOLEAN_TRUE_VALUES.has(value.trim().toLowerCase()) : false;

const shouldUsePrettyLogs = () => {
  if (process.env.LOG_PRETTY !== undefined) {
    return isTruthy(process.env.LOG_PRETTY);
  }
  return process.env.NODE_ENV !== "production" && process.stdout.isTTY === true;
};

const buildPinoLogger = (): PinoLogger => {
  const usePrettyLogs = shouldUsePrettyLogs();
  const transport = usePrettyLogs
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          singleLine: false,
        },
      })
    : undefined;

  return pino(
    {
      level: asLogLevel(process.env.LOG_LEVEL),
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    transport,
  );
};

const baseLogger = buildPinoLogger();

const emit = (level: LogMethod, message: string, metadata?: unknown) => {
  if (metadata === undefined) {
    baseLogger[level](message);
    return;
  }

  baseLogger[level]({ metadata: redactForLogs(metadata) }, message);
};

export const logger = {
  debug: (message: string, metadata?: unknown) =>
    emit("debug", message, metadata),
  info: (message: string, metadata?: unknown) => emit("info", message, metadata),
  warn: (message: string, metadata?: unknown) => emit("warn", message, metadata),
  error: (message: string, metadata?: unknown) =>
    emit("error", message, metadata),
};
