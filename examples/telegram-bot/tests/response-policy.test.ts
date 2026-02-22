import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import {
  collectToolResultParts,
  resolveTurnResponseText,
} from "@/agent/response-policy";

describe("collectToolResultParts", () => {
  it("collects tool results from tool messages", () => {
    const messages: ModelMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "tonBuildAndSendExternalMessage",
            toolCallId: "call-1",
            output: {
              type: "json",
              value: {
                hash: "abc123",
              },
            },
          },
        ],
      } as ModelMessage,
      {
        role: "assistant",
        content: [{ type: "text", text: "ignored" }],
      } as ModelMessage,
    ];

    expect(collectToolResultParts(messages)).toEqual([
      {
        toolName: "tonBuildAndSendExternalMessage",
        toolCallId: "call-1",
        output: {
          type: "json",
          value: {
            hash: "abc123",
          },
        },
      },
    ]);
  });
});

describe("resolveTurnResponseText", () => {
  it("forces execution-status text when approved callback receives plain-text re-approval ask", () => {
    const resolved = resolveTurnResponseText({
      rawText: "I need your explicit approval. Do you approve this transaction?",
      approvalsCount: 0,
      approvalWasGranted: true,
      toolResults: [
        {
          toolName: "tonBuildAndSendExternalMessage",
          toolCallId: "call-1",
          output: {
            type: "json",
            value: {
              destination: "EQABC",
              hash: "deadbeef",
            },
          },
        },
      ],
    });

    expect(resolved.forcedApprovedStatus).toBe(true);
    expect(resolved.text).toContain("Approval received.");
    expect(resolved.text).toContain("destination EQABC");
    expect(resolved.text).toContain("hash deadbeef");
    expect(resolved.text.toLowerCase()).not.toContain("do you approve");
  });

  it("falls back to pending approval message when no text and approval is not granted", () => {
    const resolved = resolveTurnResponseText({
      rawText: "",
      userRequestText: "send 1 TON to EQABC",
      approvalsCount: 1,
      approvalWasGranted: false,
      toolResults: [],
    });

    expect(resolved.forcedApprovedStatus).toBe(false);
    expect(resolved.text).toContain('Prepared the next step for "send 1 TON to EQABC".');
    expect(resolved.text).toContain("Approval pending for critical operation");
  });

  it("appends approval suffix for regular text with pending approvals", () => {
    const resolved = resolveTurnResponseText({
      rawText: "Prepared transaction details.",
      approvalsCount: 1,
      approvalWasGranted: false,
      toolResults: [],
    });

    expect(resolved.forcedApprovedStatus).toBe(false);
    expect(resolved.text).toContain("Prepared transaction details.");
    expect(resolved.text).toContain("Approval pending for critical operation");
  });

  it("rewrites trivial completion into contextual summary instead of returning Done", () => {
    const resolved = resolveTurnResponseText({
      rawText: "Done.",
      userRequestText: "check recent transfers for EQD123",
      approvalsCount: 0,
      approvalWasGranted: false,
      toolResults: [],
    });

    expect(resolved.forcedApprovedStatus).toBe(false);
    expect(resolved.text).not.toBe("Done.");
    expect(resolved.text).toContain('Completed your request about "check recent transfers for EQD123"');
  });

  it("forces approved execution status when approved callback returns trivial completion", () => {
    const resolved = resolveTurnResponseText({
      rawText: "Done.",
      approvalsCount: 0,
      approvalWasGranted: true,
      toolResults: [
        {
          toolName: "tonBuildAndSendExternalMessage",
          toolCallId: "call-2",
          output: {
            type: "json",
            value: {
              hash: "beadfeed",
            },
          },
        },
      ],
    });

    expect(resolved.forcedApprovedStatus).toBe(true);
    expect(resolved.text).toContain("Approval received.");
    expect(resolved.text).toContain("hash beadfeed");
    expect(resolved.text).not.toContain("Done.");
  });
});
