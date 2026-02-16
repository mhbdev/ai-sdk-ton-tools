import { Address } from "@ton/core";
import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress } from "../parsers";
import { addressSchema } from "../schemas";
import type { ToolOptions } from "../types";

export const createUtilityTools = ({ client }: ToolOptions) => ({
  tonGetTonApiStatus: jsonSafeTool({
    description: "Get TonAPI service status.",
    inputSchema: z.object({}),
    execute: async () => client.utilities.status(),
  }),
  tonGetTonApiOpenapiJson: jsonSafeTool({
    description: "Get TonAPI OpenAPI specification JSON.",
    inputSchema: z.object({}),
    execute: async () => client.utilities.getOpenapiJson(),
  }),
  tonAddressParseApi: jsonSafeTool({
    description: "Parse an address via TonAPI parser endpoint.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.utilities.addressParse(parseAddress(address)),
  }),
  tonAddressParse: jsonSafeTool({
    description: "Parse an address and display it in all formats.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) => {
      const parsed = parseAddress(address);
      const isFriendly = Address.isFriendly(address);
      const isRaw = Address.isRaw(address);
      const friendly = isFriendly
        ? Address.parseFriendly(address)
        : { isBounceable: null, isTestOnly: null };

      return {
        raw: parsed.toRawString(),
        workchain: parsed.workChain,
        hash: parsed.hash.toString("hex"),
        friendly: {
          bounceable: parsed.toString({ bounceable: true, testOnly: false }),
          nonBounceable: parsed.toString({
            bounceable: false,
            testOnly: false,
          }),
          bounceableTestnet: parsed.toString({
            bounceable: true,
            testOnly: true,
          }),
          nonBounceableTestnet: parsed.toString({
            bounceable: false,
            testOnly: true,
          }),
        },
        flags: {
          isFriendly,
          isRaw,
          isBounceable: friendly.isBounceable,
          isTestOnly: friendly.isTestOnly,
        },
      };
    },
  }),
});
