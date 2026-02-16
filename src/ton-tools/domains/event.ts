import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import type { ToolOptions } from "../types";

export const createEventTools = ({ client }: ToolOptions) => ({
  tonGetEvent: jsonSafeTool({
    description: "Get an event by event ID or transaction hash.",
    inputSchema: z.object({
      eventId: z.string().min(1).describe("Event ID or transaction hash."),
    }),
    execute: async ({ eventId }) => client.events.getEvent(eventId),
  }),
});
