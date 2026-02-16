import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import type { ToolOptions } from "../types";

export const createTraceTools = ({ client }: ToolOptions) => ({
  tonGetTrace: jsonSafeTool({
    description: "Get a trace by trace ID or transaction hash.",
    inputSchema: z.object({
      traceId: z.string().min(1).describe("Trace ID or transaction hash."),
    }),
    execute: async ({ traceId }) => client.traces.getTrace(traceId),
  }),
});
