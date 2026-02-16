type SandboxEvent = {
  sandboxId?: string;
  status?: string;
};

const parseSandboxEventObject = (value: unknown): SandboxEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sandboxId =
    typeof record.sandboxId === "string" ? record.sandboxId : undefined;
  const status = typeof record.status === "string" ? record.status : undefined;

  if (!sandboxId && !status) {
    return null;
  }

  return { sandboxId, status };
};

export const parseSandboxEvent = (value: unknown): SandboxEvent | null => {
  const direct = parseSandboxEventObject(value);
  if (direct) {
    return direct;
  }

  if (typeof value === "string") {
    try {
      return parseSandboxEventObject(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return null;
};

const extractFromPart = (part: unknown): SandboxEvent | null => {
  if (!part || typeof part !== "object") {
    return null;
  }

  const record = part as Record<string, unknown>;
  if (typeof record.type !== "string" || !record.type.startsWith("tool-")) {
    return null;
  }

  return parseSandboxEvent(record.output);
};

export const extractSandboxEventsFromParts = (parts: unknown): SandboxEvent[] => {
  if (!Array.isArray(parts)) {
    return [];
  }

  const events: SandboxEvent[] = [];
  for (const part of parts) {
    const event = extractFromPart(part);
    if (event) {
      events.push(event);
    }
  }

  return events;
};

export const extractSandboxIdsFromParts = (parts: unknown): string[] =>
  Array.from(
    new Set(
      extractSandboxEventsFromParts(parts)
        .map((event) => event.sandboxId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

