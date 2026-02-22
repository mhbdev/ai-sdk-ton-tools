import { logger } from "@/observability/logger";
import { getEnv } from "@/config/env";

export const initTelemetry = () => {
  const env = getEnv();
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info("Telemetry exporter not configured; running without OTLP.");
    return;
  }

  logger.info("Telemetry initialized.", {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: "telegram-ton-agent-bot",
  });
};

