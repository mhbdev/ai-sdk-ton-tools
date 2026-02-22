import { describe, expect, it } from "vitest";
import { resolveEffectivePreferences } from "@/preferences/resolver";

describe("resolveEffectivePreferences", () => {
  it("uses chat overrides over user defaults", () => {
    const resolved = resolveEffectivePreferences({
      user: {
        defaultResponseStyle: "concise",
        defaultRiskProfile: "balanced",
        defaultNetwork: "mainnet",
      } as never,
      chat: {
        responseStyleOverride: "detailed",
        riskProfileOverride: "advanced",
        network: "testnet",
      } as never,
    });

    expect(resolved).toEqual({
      responseStyle: "detailed",
      riskProfile: "advanced",
      network: "testnet",
    });
  });

  it("falls back to user defaults when chat overrides are missing", () => {
    const resolved = resolveEffectivePreferences({
      user: {
        defaultResponseStyle: "concise",
        defaultRiskProfile: "cautious",
        defaultNetwork: "testnet",
      } as never,
      chat: {
        responseStyleOverride: null,
        riskProfileOverride: null,
        network: "testnet",
      } as never,
    });

    expect(resolved.responseStyle).toBe("concise");
    expect(resolved.riskProfile).toBe("cautious");
    expect(resolved.network).toBe("testnet");
  });

  it("falls back to system defaults when no profile is present", () => {
    const resolved = resolveEffectivePreferences({
      user: null,
      chat: null,
    });

    expect(resolved).toEqual({
      responseStyle: "concise",
      riskProfile: "balanced",
      network: "mainnet",
    });
  });
});
