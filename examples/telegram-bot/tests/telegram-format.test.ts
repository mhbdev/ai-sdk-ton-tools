import { describe, expect, it } from "vitest";
import {
  hasLikelyMarkdownFormatting,
  renderTelegramHtmlFromMarkdown,
} from "@/telegram/format";

describe("hasLikelyMarkdownFormatting", () => {
  it("detects markdown syntax signals", () => {
    expect(hasLikelyMarkdownFormatting("**bold** text")).toBe(true);
    expect(hasLikelyMarkdownFormatting("`code` sample")).toBe(true);
    expect(hasLikelyMarkdownFormatting("[TON](https://ton.org)")).toBe(true);
    expect(hasLikelyMarkdownFormatting("### Header")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(hasLikelyMarkdownFormatting("hello world")).toBe(false);
  });
});

describe("renderTelegramHtmlFromMarkdown", () => {
  it("renders common markdown constructs into Telegram HTML", () => {
    const html = renderTelegramHtmlFromMarkdown(
      "**Bold** and `code` with [link](https://example.com)",
    );

    expect(html).toContain("<b>Bold</b>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it("escapes html while preserving fenced code blocks", () => {
    const html = renderTelegramHtmlFromMarkdown(
      "Use <unsafe> tags\n```ts\nconst x = '<ok>';\n```",
    );

    expect(html).toContain("Use &lt;unsafe&gt; tags");
    expect(html).toContain("<pre><code");
    expect(html).toContain("&lt;ok&gt;");
  });
});
