import { z } from "zod";

import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress } from "../parsers";
import { addressSchema } from "../schemas";
import type { ToolOptions } from "../types";

export const createMultisigTools = ({ client }: ToolOptions) => ({
  tonGetMultisigAccountInfo: jsonSafeTool({
    description: "Get detailed multisig account data by address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.multisig.getMultisigAccount(parseAddress(address)),
  }),
});
