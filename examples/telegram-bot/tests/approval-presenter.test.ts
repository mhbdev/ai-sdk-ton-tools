import { describe, expect, it } from "vitest";
import {
  renderApprovalCardText,
  renderApprovalDetailsText,
} from "@/approvals/presenter";

describe("approval presenter", () => {
  it("renders human-readable approval cards without raw JSON payloads", () => {
    const card = renderApprovalCardText({
      approvalId: "apr_1",
      toolName: "tonSendBlockchainMessage",
      inputJson: {
        amount: "2.5",
        gas_fee: "0.03",
        to: "EQabc123",
      },
      expiresAt: new Date("2026-02-22T12:00:00.000Z"),
      riskProfile: "balanced",
      status: "requested",
      now: new Date("2026-02-22T11:58:00.000Z"),
    });

    expect(card.text).toContain("Pending Approval");
    expect(card.text).toContain("Estimated Value:");
    expect(card.text).toContain("Estimated Gas:");
    expect(card.text).not.toContain("{\"amount\"");
  });

  it("flags cautious profile high-risk approvals for second confirmation", () => {
    const card = renderApprovalCardText({
      approvalId: "apr_2",
      toolName: "tonSendBlockchainMessageBatch",
      inputJson: {
        amount: "125",
      },
      expiresAt: new Date("2026-02-22T12:00:00.000Z"),
      riskProfile: "cautious",
      status: "requested",
      now: new Date("2026-02-22T11:58:00.000Z"),
    });

    expect(card.cautiousRequiresSecondTap).toBe(true);
    expect(card.text).toContain("Cautious mode");
  });

  it("renders details text with explicit risk reasoning", () => {
    const details = renderApprovalDetailsText({
      approvalId: "apr_3",
      toolName: "tonBuildAndSendExternalMessage",
      inputJson: {
        amount_nano: "2000000000",
      },
      expiresAt: new Date("2026-02-22T12:00:00.000Z"),
      riskProfile: "balanced",
      status: "requested",
    });

    expect(details.text).toContain("Risk reasoning:");
    expect(details.text).toContain("Estimated Value:");
    expect(details.text).toContain("Estimate Confidence:");
  });
});
