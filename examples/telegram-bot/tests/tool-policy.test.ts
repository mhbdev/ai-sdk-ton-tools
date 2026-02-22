import { describe, expect, it } from "vitest";
import { buildPolicyWrappedTonTools } from "@/agent/tool-policy";

describe("buildPolicyWrappedTonTools", () => {
  it("disables secret-handling tools", () => {
    const tools = buildPolicyWrappedTonTools({
      apiKey: "test-key",
      network: "mainnet",
      chatType: "private",
    });

    expect(tools.tonGenerateWalletMnemonic).toBeUndefined();
    expect(tools.tonMnemonicToWalletKeys).toBeUndefined();
    expect(tools.tonSignData).toBeUndefined();
    expect(tools.tonSafeSignCellBoc).toBeUndefined();
  });

  it("requires approval for critical write tools", () => {
    const tools = buildPolicyWrappedTonTools({
      apiKey: "test-key",
      network: "mainnet",
      chatType: "private",
    });

    expect(tools.tonSendBlockchainMessage?.needsApproval).toBe(true);
    expect(tools.tonSendBlockchainMessageBatch?.needsApproval).toBe(true);
    expect(tools.tonBuildAndSendExternalMessage?.needsApproval).toBe(true);
  });

  it("adds a DNS-by-address alias tool", () => {
    const tools = buildPolicyWrappedTonTools({
      apiKey: "test-key",
      network: "mainnet",
      chatType: "private",
    });

    expect(tools.tonFindAddressDnsItems).toBeDefined();
    expect(tools.tonFindAddressDnsItems?.description).toContain(
      "Find DNS items/domains for a TON address",
    );
  });
});
