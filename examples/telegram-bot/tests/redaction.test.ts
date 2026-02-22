import { describe, expect, it } from "vitest";
import { redactForLogs } from "@/security/redaction";

describe("redactForLogs", () => {
  it("redacts sensitive keys", () => {
    const input = {
      token: "my-secret-token",
      nested: {
        apiKey: "abc123",
      },
      safe: "value",
    };
    const output = redactForLogs(input);
    expect(output.token).toBe("[REDACTED]");
    expect((output.nested as { apiKey: string }).apiKey).toBe("[REDACTED]");
    expect(output.safe).toBe("value");
  });

  it("redacts bearer strings", () => {
    const output = redactForLogs("Authorization: Bearer abc.def.ghi");
    expect(output).toContain("Bearer [REDACTED]");
  });
});

