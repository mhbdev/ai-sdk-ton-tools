const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

export const chunkTelegramMessage = (
  text: string,
  maxChars = TELEGRAM_MAX_MESSAGE_CHARS,
) => {
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + maxChars, text.length);

    if (end < text.length) {
      const slice = text.slice(cursor, end);
      const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (lastBreak > 0) {
        end = cursor + lastBreak;
      }
    }

    const part = text.slice(cursor, end).trim();
    if (part.length > 0) {
      chunks.push(part);
    }

    cursor = end;
  }

  return chunks;
};

