import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { addressListSchema, addressSchema, ltSchema, timestampSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseAddress, parseAddresses, parseLt } from "../parsers";

export const createNftTools = ({ client }: ToolOptions) => ({
  tonGetNftCollections: jsonSafeTool({
    description: "List NFT collections.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of collections to return."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination."),
    }),
    execute: async ({ limit, offset }) =>
      client.nft.getNftCollections({
        limit,
        offset,
      }),
  }),
  tonGetNftCollection: jsonSafeTool({
    description: "Get NFT collection metadata by collection address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.nft.getNftCollection(parseAddress(address)),
  }),
  tonGetNftCollectionItems: jsonSafeTool({
    description: "Get NFT items from a collection.",
    inputSchema: z.object({
      collectionAddress: addressSchema.describe("Collection address."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of items to return."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination."),
    }),
    execute: async ({ collectionAddress, limit, offset }) =>
      client.nft.getItemsFromCollection(parseAddress(collectionAddress), {
        limit,
        offset,
      }),
  }),
  tonGetNftItemsBulk: jsonSafeTool({
    description: "Get NFT items by their addresses.",
    inputSchema: z.object({
      addresses: addressListSchema.describe("NFT item addresses."),
    }),
    execute: async ({ addresses }) =>
      client.nft.getNftItemsByAddresses({
        accountIds: parseAddresses(addresses),
      }),
  }),
  tonGetNftCollectionItemsBulk: jsonSafeTool({
    description: "Get NFT collections by their addresses.",
    inputSchema: z.object({
      addresses: addressListSchema.describe("Collection addresses."),
    }),
    execute: async ({ addresses }) =>
      client.nft.getNftCollectionItemsByAddresses({
        accountIds: parseAddresses(addresses),
      }),
  }),
  tonGetNftItem: jsonSafeTool({
    description: "Get an NFT item by its address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.nft.getNftItemByAddress(parseAddress(address)),
  }),
  tonGetNftHistoryById: jsonSafeTool({
    description: "Get transfer history for a specific NFT item.",
    inputSchema: z.object({
      address: addressSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema
        .optional()
        .describe("Filter events starting from this timestamp."),
      endDate: timestampSchema
        .optional()
        .describe("Filter events ending at this timestamp."),
    }),
    execute: async ({ address, limit, beforeLt, startDate, endDate }) =>
      client.nft.getNftHistoryById(parseAddress(address), {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate,
      }),
  }),
});
