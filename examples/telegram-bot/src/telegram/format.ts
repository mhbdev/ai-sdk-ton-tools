const MARKDOWN_SIGNAL_REGEX =
  /```[\s\S]*?```|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+\]\((?:https?:\/\/|ton:\/\/|tg:\/\/)[^)]+\)|^#{1,6}\s.+$/m;

const FENCED_CODE_REGEX = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const LINK_REGEX =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|ton:\/\/|tg:\/\/)[^)\s]+)\)/g;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const stashHtml = (stash: string[], html: string) => {
  const token = `@@TG_HTML_${stash.length}@@`;
  stash.push(html);
  return token;
};

export const hasLikelyMarkdownFormatting = (text: string) =>
  MARKDOWN_SIGNAL_REGEX.test(text);

export const renderTelegramHtmlFromMarkdown = (markdown: string) => {
  const protectedHtmlParts: string[] = [];
  let text = markdown.replace(FENCED_CODE_REGEX, (_, lang: string, code: string) => {
    const escapedCode = escapeHtml((code ?? "").replace(/\n$/, ""));
    if (typeof lang === "string" && lang.trim().length > 0) {
      const escapedLang = escapeHtml(lang.trim());
      return stashHtml(
        protectedHtmlParts,
        `<pre><code class="language-${escapedLang}">${escapedCode}</code></pre>`,
      );
    }
    return stashHtml(protectedHtmlParts, `<pre>${escapedCode}</pre>`);
  });

  text = text.replace(INLINE_CODE_REGEX, (_, code: string) =>
    stashHtml(protectedHtmlParts, `<code>${escapeHtml(code ?? "")}</code>`),
  );

  text = escapeHtml(text);
  text = text.replace(
    LINK_REGEX,
    (_match, label: string, href: string) => `<a href="${href}">${label}</a>`,
  );
  text = text.replace(/\*\*([^\n*]+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^\n_]+?)__/g, "<b>$1</b>");
  text = text.replace(/~~([^\n~]+?)~~/g, "<s>$1</s>");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  return text.replace(/@@TG_HTML_(\d+)@@/g, (_match, indexText: string) => {
    const index = Number(indexText);
    return Number.isInteger(index) && index >= 0
      ? (protectedHtmlParts[index] ?? "")
      : "";
  });
};

export const isTelegramParseModeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /can't parse entities|can't find end of the entity|entity parse|parse_mode/i.test(
    message,
  );
};
