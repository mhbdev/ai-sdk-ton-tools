import { describe, expect, it } from "vitest";
import { resolveGatewayFallbackModelId } from "@/agent/model-provider";

describe("resolveGatewayFallbackModelId", () => {
  it("uses the requested model when fallback model is not configured", () => {
    expect(resolveGatewayFallbackModelId("openai/gpt-5.2")).toBe("openai/gpt-5.2");
    expect(resolveGatewayFallbackModelId("openai/gpt-5.2", "")).toBe("openai/gpt-5.2");
    expect(resolveGatewayFallbackModelId("openai/gpt-5.2", "   ")).toBe("openai/gpt-5.2");
  });

  it("uses the configured fallback model when provided", () => {
    expect(
      resolveGatewayFallbackModelId(
        "openai/gpt-5.2",
        "anthropic/claude-sonnet-4-5-20250929",
      ),
    ).toBe("anthropic/claude-sonnet-4-5-20250929");
    expect(resolveGatewayFallbackModelId("openai/gpt-5.2", " openai/gpt-4o ")).toBe(
      "openai/gpt-4o",
    );
  });
});
