import { z } from "zod";

import { jsonSafeTool } from "../json-safe-tool";
import type { ToolOptions } from "../types";

export const createExtraCurrencyTools = ({ client }: ToolOptions) => ({
  tonGetExtraCurrencyInfo: jsonSafeTool({
    description: "Get metadata for an extra currency ID.",
    inputSchema: z.object({
      currencyId: z.number().int().describe("Extra currency ID."),
    }),
    execute: async ({ currencyId }) =>
      client.extraCurrency.getExtraCurrencyInfo(currencyId),
  }),
});
