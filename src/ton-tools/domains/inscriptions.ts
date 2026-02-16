import { z } from "zod";

import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress, parseLt } from "../parsers";
import { addressSchema, ltSchema } from "../schemas";
import type { ToolOptions } from "../types";

export const createInscriptionsTools = ({ client }: ToolOptions) => ({
  tonGetAccountInscriptions: jsonSafeTool({
    description: "Get inscription balances for an account (experimental API).",
    inputSchema: z.object({
      address: addressSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(1000)
        .describe("Maximum number of records to return."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Offset for pagination."),
    }),
    execute: async ({ address, limit, offset }) =>
      client.inscriptions.getAccountInscriptions(parseAddress(address), {
        limit,
        offset,
      }),
  }),
  tonGetAccountInscriptionsHistory: jsonSafeTool({
    description:
      "Get account inscription transfer history (experimental API).",
    inputSchema: z.object({
      address: addressSchema,
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of events to return."),
    }),
    execute: async ({ address, beforeLt, limit }) =>
      client.inscriptions.getAccountInscriptionsHistory(parseAddress(address), {
        before_lt: parseLt(beforeLt),
        limit,
      }),
  }),
  tonGetAccountInscriptionsHistoryByTicker: jsonSafeTool({
    description:
      "Get inscription transfer history for an account and ticker (experimental API).",
    inputSchema: z.object({
      address: addressSchema,
      ticker: z.string().min(1).describe("Inscription ticker."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of events to return."),
    }),
    execute: async ({ address, ticker, beforeLt, limit }) =>
      client.inscriptions.getAccountInscriptionsHistoryByTicker(
        parseAddress(address),
        ticker,
        {
          before_lt: parseLt(beforeLt),
          limit,
        }
      ),
  }),
  tonGetInscriptionOpTemplate: jsonSafeTool({
    description:
      "Get comment template for inscription operations (experimental API).",
    inputSchema: z.object({
      type: z
        .enum(["ton20", "gram20"])
        .describe("Inscription standard type."),
      operation: z
        .enum(["transfer"])
        .default("transfer")
        .describe("Inscription operation."),
      amount: ltSchema.describe("Amount in base units."),
      ticker: z.string().min(1).describe("Inscription ticker."),
      who: z.string().min(1).describe("Recipient account string."),
      destination: z
        .string()
        .min(1)
        .optional()
        .describe("Optional destination address string."),
      comment: z
        .string()
        .min(1)
        .optional()
        .describe("Optional comment override."),
    }),
    execute: async ({
      type,
      operation,
      amount,
      ticker,
      who,
      destination,
      comment,
    }) =>
      client.inscriptions.getInscriptionOpTemplate({
        type,
        operation,
        amount: parseLt(amount)!,
        ticker,
        who,
        destination,
        comment,
      }),
  }),
});
