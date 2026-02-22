import { describe, expect, it } from "vitest";
import {
  buildOtlpHttpExportUrls,
  resolveMetricReaderTiming,
} from "@/observability/telemetry";

describe("buildOtlpHttpExportUrls", () => {
  it("builds default OTLP HTTP paths from a host endpoint", () => {
    const urls = buildOtlpHttpExportUrls("http://localhost:4318");
    expect(urls.tracesUrl).toBe("http://localhost:4318/v1/traces");
    expect(urls.metricsUrl).toBe("http://localhost:4318/v1/metrics");
  });

  it("preserves custom collector base path", () => {
    const urls = buildOtlpHttpExportUrls("https://otel.example.com/collector");
    expect(urls.tracesUrl).toBe("https://otel.example.com/collector/v1/traces");
    expect(urls.metricsUrl).toBe("https://otel.example.com/collector/v1/metrics");
  });

  it("normalizes explicit traces endpoint into traces and metrics urls", () => {
    const urls = buildOtlpHttpExportUrls("http://collector:4318/v1/traces");
    expect(urls.tracesUrl).toBe("http://collector:4318/v1/traces");
    expect(urls.metricsUrl).toBe("http://collector:4318/v1/metrics");
  });

  it("adds protocol when omitted", () => {
    const urls = buildOtlpHttpExportUrls("collector:4318");
    expect(urls.tracesUrl).toBe("http://collector:4318/v1/traces");
    expect(urls.metricsUrl).toBe("http://collector:4318/v1/metrics");
  });

  it("throws on empty endpoint", () => {
    expect(() => buildOtlpHttpExportUrls("   ")).toThrow("OTLP endpoint must be non-empty.");
  });
});

describe("resolveMetricReaderTiming", () => {
  it("uses valid defaults", () => {
    expect(resolveMetricReaderTiming(undefined, undefined)).toEqual({
      exportIntervalMillis: 60000,
      exportTimeoutMillis: 30000,
      wasTimeoutClamped: false,
    });
  });

  it("clamps timeout when larger than interval", () => {
    expect(resolveMetricReaderTiming("10000", "30000")).toEqual({
      exportIntervalMillis: 10000,
      exportTimeoutMillis: 10000,
      wasTimeoutClamped: true,
    });
  });

  it("falls back on invalid values", () => {
    expect(resolveMetricReaderTiming("x", "y")).toEqual({
      exportIntervalMillis: 60000,
      exportTimeoutMillis: 30000,
      wasTimeoutClamped: false,
    });
  });
});
