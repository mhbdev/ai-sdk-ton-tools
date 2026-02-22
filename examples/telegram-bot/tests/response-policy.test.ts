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
      approvalsCount: 1,
      approvalWasGranted: false,
      toolResults: [],
    });

    expect(resolved.forcedApprovedStatus).toBe(false);
    expect(resolved.text).toBe("Action paused pending your approval.");
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
});
