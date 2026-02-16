import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { addressSchema, optionalAddressSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseAddress, parseOptionalAddress } from "../parsers";

export const createStakingTools = ({ client }: ToolOptions) => ({
  tonGetStakingPools: jsonSafeTool({
    description: "List staking pools available in the network.",
    inputSchema: z.object({
      availableFor: optionalAddressSchema.describe(
        "Account address to filter pools available for that account."
      ),
      includeUnverified: z
        .boolean()
        .optional()
        .describe("Include pools not in the whitelist."),
    }),
    execute: async ({ availableFor, includeUnverified }) =>
      client.staking.getStakingPools({
        available_for: parseOptionalAddress(availableFor),
        include_unverified: includeUnverified,
      }),
  }),
  tonGetStakingPoolInfo: jsonSafeTool({
    description: "Get staking pool info by address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.staking.getStakingPoolInfo(parseAddress(address)),
  }),
  tonGetStakingPoolHistory: jsonSafeTool({
    description: "Get staking pool history by address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.staking.getStakingPoolHistory(parseAddress(address)),
  }),
  tonGetAccountNominatorPools: jsonSafeTool({
    description: "List staking pools where the account is a nominator.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.staking.getAccountNominatorsPools(parseAddress(address)),
  }),
});
