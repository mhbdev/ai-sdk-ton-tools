import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { addressListSchema, addressSchema, ltSchema, timestampSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseAddress, parseAddresses, parseLt } from "../parsers";

export const createJettonTools = ({ client }: ToolOptions) => ({
  tonGetJettons: jsonSafeTool({
    description: "List indexed jetton masters.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of jettons to return."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination."),
    }),
    execute: async ({ limit, offset }) =>
      client.jettons.getJettons({
        limit,
        offset,
      }),
  }),
  tonGetJettonInfo: jsonSafeTool({
    description: "Get jetton metadata by jetton master address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.jettons.getJettonInfo(parseAddress(address)),
  }),
  tonGetJettonInfosBulk: jsonSafeTool({
    description: "Get jetton metadata for multiple jetton masters.",
    inputSchema: z.object({
      addresses: addressListSchema.describe("Jetton master addresses."),
    }),
    execute: async ({ addresses }) =>
      client.jettons.getJettonInfosByAddresses({
        accountIds: parseAddresses(addresses),
      }),
  }),
  tonGetJettonHolders: jsonSafeTool({
    description: "Get holders for a jetton master address.",
    inputSchema: z.object({
      address: addressSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(1000)
        .describe("Maximum number of holders to return."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination."),
    }),
    execute: async ({ address, limit, offset }) =>
      client.jettons.getJettonHolders(parseAddress(address), {
        limit,
        offset,
      }),
  }),
  tonGetJettonTransferPayload: jsonSafeTool({
    description:
      "Get custom payload/state-init required for jetton transfer by account.",
    inputSchema: z.object({
      address: addressSchema.describe("Owner wallet address."),
      jettonAddress: addressSchema.describe("Jetton master address."),
    }),
    execute: async ({ address, jettonAddress }) =>
      client.jettons.getJettonTransferPayload(
        parseAddress(address),
        parseAddress(jettonAddress)
      ),
  }),
  tonGetJettonsEvent: jsonSafeTool({
    description: "Get jetton transfers associated with an event.",
    inputSchema: z.object({
      eventId: z.string().min(1).describe("Event ID to inspect."),
    }),
    execute: async ({ eventId }) => client.jettons.getJettonsEvents(eventId),
  }),
});
