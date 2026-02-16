import { tool, type Tool, type ToolExecuteFunction } from "ai";

const toJsonSafeValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeValue(item, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (value instanceof Date) {
      return value;
    }

    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = toJsonSafeValue(nestedValue, seen);
    }
    return result;
  }

  return value;
};

type ExecutableTool<INPUT = unknown, OUTPUT = unknown> = Tool<INPUT, OUTPUT> & {
  execute: ToolExecuteFunction<INPUT, OUTPUT>;
};

export function jsonSafeTool<INPUT = unknown, OUTPUT = unknown>(
  definition: ExecutableTool<INPUT, OUTPUT>
): Tool<INPUT, OUTPUT> {
  return tool<INPUT, OUTPUT>({
    ...definition,
    execute: async (input, options) => {
      try {
        return toJsonSafeValue(await definition.execute(input, options)) as OUTPUT;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Unexpected end of JSON input")
        ) {
          throw new Error(
            "TON API returned an empty or invalid JSON response. Verify TONAPI_API_KEY, network/baseUrl, and upstream availability."
          );
        }

        throw error;
      }
    },
  });
}
