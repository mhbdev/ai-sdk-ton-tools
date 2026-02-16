import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import type { ToolOptions } from "../types";

export const createStorageTools = ({ client }: ToolOptions) => ({
  tonGetStorageProviders: jsonSafeTool({
    description: "Get TON storage providers.",
    inputSchema: z.object({}),
    execute: async () => client.storage.getStorageProviders(),
  }),
});
