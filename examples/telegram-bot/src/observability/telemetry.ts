import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getEnv } from "@/config/env";
import { logger } from "@/observability/logger";

const SERVICE_NAME = "telegram-ton-agent-bot";
const TRACE_PATH_SUFFIX = "/v1/traces";
const METRIC_PATH_SUFFIX = "/v1/metrics";
const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 60_000;
const DEFAULT_METRIC_EXPORT_TIMEOUT_MS = 30_000;

type OtlpExportUrls = {
  tracesUrl: string;
  metricsUrl: string;
};

type MetricReaderTiming = {
  exportIntervalMillis: number;
  exportTimeoutMillis: number;
  wasTimeoutClamped: boolean;
};

export type TelemetryHandle = {
  enabled: boolean;
  shutdown: () => Promise<void>;
};

const NOOP_TELEMETRY_HANDLE: TelemetryHandle = {
  enabled: false,
  shutdown: async () => {},
};

let cachedTelemetryHandle: TelemetryHandle | null = null;

const ensureEndpointHasProtocol = (endpoint: string) => {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(endpoint)) {
    return endpoint;
  }
  return `http://${endpoint}`;
};

const dropSignalSuffix = (path: string) => {
  if (path.endsWith(TRACE_PATH_SUFFIX)) {
    return path.slice(0, -TRACE_PATH_SUFFIX.length);
  }
  if (path.endsWith(METRIC_PATH_SUFFIX)) {
    return path.slice(0, -METRIC_PATH_SUFFIX.length);
  }
  return path;
};

const normalizeBasePath = (path: string) => {
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  const withoutSignalSuffix = dropSignalSuffix(withLeadingSlash);
  const withoutTrailingSlash = withoutSignalSuffix.replace(/\/+$/, "");

  if (withoutTrailingSlash === "/" || withoutTrailingSlash === "") {
    return "";
  }
  return withoutTrailingSlash;
};

const withSignalPath = (basePath: string, suffix: typeof TRACE_PATH_SUFFIX | typeof METRIC_PATH_SUFFIX) =>
  basePath.length > 0 ? `${basePath}${suffix}` : suffix;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

export const resolveMetricReaderTiming = (
  rawInterval: string | undefined,
  rawTimeout: string | undefined,
): MetricReaderTiming => {
  const exportIntervalMillis = parsePositiveInt(rawInterval, DEFAULT_METRIC_EXPORT_INTERVAL_MS);
  const parsedTimeout = parsePositiveInt(rawTimeout, DEFAULT_METRIC_EXPORT_TIMEOUT_MS);

  if (parsedTimeout <= exportIntervalMillis) {
    return {
      exportIntervalMillis,
      exportTimeoutMillis: parsedTimeout,
      wasTimeoutClamped: false,
    };
  }

  return {
    exportIntervalMillis,
    exportTimeoutMillis: exportIntervalMillis,
    wasTimeoutClamped: true,
  };
};

export const buildOtlpHttpExportUrls = (rawEndpoint: string): OtlpExportUrls => {
  const endpoint = rawEndpoint.trim();
  if (!endpoint) {
    throw new Error("OTLP endpoint must be non-empty.");
  }

  const normalizedEndpoint = ensureEndpointHasProtocol(endpoint);
  const endpointUrl = new URL(normalizedEndpoint);
  const basePath = normalizeBasePath(endpointUrl.pathname);

  const tracesUrl = new URL(endpointUrl.toString());
  tracesUrl.pathname = withSignalPath(basePath, TRACE_PATH_SUFFIX);
  tracesUrl.hash = "";

  const metricsUrl = new URL(endpointUrl.toString());
  metricsUrl.pathname = withSignalPath(basePath, METRIC_PATH_SUFFIX);
  metricsUrl.hash = "";

  return {
    tracesUrl: tracesUrl.toString(),
    metricsUrl: metricsUrl.toString(),
  };
};

export const initTelemetry = (): TelemetryHandle => {
  if (cachedTelemetryHandle) {
    return cachedTelemetryHandle;
  }

  const env = getEnv();
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info("Telemetry exporter not configured; running without OTLP.");
    cachedTelemetryHandle = NOOP_TELEMETRY_HANDLE;
    return cachedTelemetryHandle;
  }

  let exportUrls: OtlpExportUrls;
  try {
    exportUrls = buildOtlpHttpExportUrls(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  } catch (error) {
    logger.error("Invalid OTLP endpoint. Telemetry disabled.", {
      endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
      error: String(error),
    });
    cachedTelemetryHandle = NOOP_TELEMETRY_HANDLE;
    return cachedTelemetryHandle;
  }

  const metricReaderTiming = resolveMetricReaderTiming(
    process.env.OTEL_METRIC_EXPORT_INTERVAL,
    process.env.OTEL_METRIC_EXPORT_TIMEOUT,
  );
  if (metricReaderTiming.wasTimeoutClamped) {
    logger.warn("OTEL metric timeout exceeded interval and was clamped.", {
      exportIntervalMillis: metricReaderTiming.exportIntervalMillis,
      exportTimeoutMillis: metricReaderTiming.exportTimeoutMillis,
    });
  }
  const serviceVersion = process.env.npm_package_version ?? "0.0.0";

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    "deployment.environment.name": env.NODE_ENV,
  });

  const traceExporter = new OTLPTraceExporter({
    url: exportUrls.tracesUrl,
  });
  const metricExporter = new OTLPMetricExporter({
    url: exportUrls.metricsUrl,
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: metricReaderTiming.exportIntervalMillis,
    exportTimeoutMillis: metricReaderTiming.exportTimeoutMillis,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReaders: [metricReader],
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    sdk.start();
  } catch (error) {
    logger.error("Failed to initialize OpenTelemetry SDK. Telemetry disabled.", {
      error: String(error),
    });
    cachedTelemetryHandle = NOOP_TELEMETRY_HANDLE;
    return cachedTelemetryHandle;
  }

  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async () => {
    if (!shutdownPromise) {
      shutdownPromise = sdk.shutdown().catch((error) => {
        logger.error("Failed to shutdown OpenTelemetry SDK cleanly.", {
          error: String(error),
        });
      });
    }

    await shutdownPromise;
  };

  cachedTelemetryHandle = {
    enabled: true,
    shutdown,
  };

  logger.info("Telemetry initialized.", {
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    tracesUrl: exportUrls.tracesUrl,
    metricsUrl: exportUrls.metricsUrl,
    serviceName: SERVICE_NAME,
  });

  return cachedTelemetryHandle;
};
