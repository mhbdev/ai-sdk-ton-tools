import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { stateInitSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseStateInit } from "../parsers";

export const createTonConnectTools = ({ client }: ToolOptions) => ({
  tonGetTonConnectPayload: jsonSafeTool({
    description: "Get a TonConnect payload for wallet connection.",
    inputSchema: z.object({}),
    execute: async () => client.connect.getTonConnectPayload(),
  }),
  tonGetAccountInfoByStateInit: jsonSafeTool({
    description: "Get account info from a state init BOC payload.",
    inputSchema: z.object({
      stateInit: stateInitSchema,
    }),
    execute: async ({ stateInit }) =>
      client.connect.getAccountInfoByStateInit({
        stateInit: parseStateInit(stateInit),
      }),
  }),
});
