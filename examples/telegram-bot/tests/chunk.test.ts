import { describe, expect, it } from "vitest";
import { chunkTelegramMessage } from "@/utils/chunk";

describe("chunkTelegramMessage", () => {
  it("returns single chunk when below limit", () => {
    const chunks = chunkTelegramMessage("hello", 4096);
    expect(chunks).toEqual(["hello"]);
  });

  it("splits oversized message into bounded chunks", () => {
    const text = "a".repeat(9000);
    const chunks = chunkTelegramMessage(text, 4096);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 4096)).toBe(true);
    expect(chunks.join("")).toContain("a");
  });
});

