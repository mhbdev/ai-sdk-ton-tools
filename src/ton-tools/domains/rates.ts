import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { addressSchema, timestampSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseAddress } from "../parsers";

export const createRatesTools = ({ client }: ToolOptions) => ({
  tonGetRates: jsonSafeTool({
    description: "Get token prices in selected currencies (display only).",
    inputSchema: z.object({
      tokens: z
        .array(z.string().min(1))
        .min(1)
        .max(100)
        .describe('Tokens to price, e.g. "ton" or jetton addresses.'),
      currencies: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe('Fiat currencies like "usd", "eur".'),
    }),
    execute: async ({ tokens, currencies }) =>
      client.rates.getRates({
        tokens,
        currencies,
      }),
  }),
  tonGetChartRates: jsonSafeTool({
    description: "Get historical price chart for a token.",
    inputSchema: z.object({
      token: addressSchema.describe("Jetton master address."),
      currency: z
        .string()
        .min(1)
        .optional()
        .describe('Fiat currency code like "usd".'),
      startDate: timestampSchema
        .optional()
        .describe("Chart start timestamp in seconds."),
      endDate: timestampSchema
        .optional()
        .describe("Chart end timestamp in seconds."),
      pointsCount: z
        .number()
        .int()
        .min(0)
        .max(200)
        .optional()
        .describe("Maximum number of points to return."),
    }),
    execute: async ({ token, currency, startDate, endDate, pointsCount }) =>
      client.rates.getChartRates({
        token: parseAddress(token),
        currency,
        start_date: startDate,
        end_date: endDate,
        points_count: pointsCount,
      }),
  }),
  tonGetMarketsRates: jsonSafeTool({
    description: "Get TON price from markets.",
    inputSchema: z.object({}),
    execute: async () => client.rates.getMarketsRates(),
  }),
});
