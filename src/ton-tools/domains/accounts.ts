import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import {
  addressListSchema,
  addressSchema,
  ltSchema,
  optionalAddressSchema,
  timestampSchema,
} from "../schemas";
import type { ToolOptions } from "../types";
import {
  parseAddress,
  parseAddresses,
  parseLt,
  parseOptionalAddress,
} from "../parsers";

export const createAccountTools = ({ client }: ToolOptions) => ({
  tonGetAccount: jsonSafeTool({
    description: "Get account details for a TON address.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.getAccount(parseAddress(address)),
  }),
  tonGetAccountsBulk: jsonSafeTool({
    description: "Get details for multiple accounts in one request.",
    inputSchema: z.object({
      addresses: addressListSchema.describe("Account addresses to fetch."),
      currency: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Optional fiat currency code for balance display. (e.g usd)."
        ),
    }),
    execute: async ({ addresses, currency }) =>
      client.accounts.getAccounts(
        {
          accountIds: parseAddresses(addresses),
        },
        {
          currency,
        }
      ),
  }),
  tonGetAccountPublicKey: jsonSafeTool({
    description: "Get public key for a wallet account.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.getAccountPublicKey(parseAddress(address)),
  }),
  tonReindexAccount: jsonSafeTool({
    description:
      "Trigger account reindexing in TonAPI (useful for stale indexed data).",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.reindexAccount(parseAddress(address)),
  }),
  tonGetAccountDomains: jsonSafeTool({
    description: "Get DNS domains linked to an account.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.accountDnsBackResolve(parseAddress(address)),
  }),
  tonGetAccountDnsExpiring: jsonSafeTool({
    description: "Get expiring .ton DNS records for an account.",
    inputSchema: z.object({
      address: addressSchema,
      period: z
        .number()
        .int()
        .min(1)
        .max(3660)
        .optional()
        .describe("Number of days before expiration to include."),
    }),
    execute: async ({ address, period }) =>
      client.accounts.getAccountDnsExpiring(parseAddress(address), {
        period,
      }),
  }),
  tonSearchAccounts: jsonSafeTool({
    description: "Search accounts by .ton domain name prefix.",
    inputSchema: z.object({
      name: z
        .string()
        .min(3)
        .max(15)
        .describe("Domain name prefix to search for."),
    }),
    execute: async ({ name }) =>
      client.accounts.searchAccounts({
        name,
      }),
  }),
  tonGetAccountEvents: jsonSafeTool({
    description:
      "Get high-level account events derived from traces and actions.",
    inputSchema: z.object({
      address: addressSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema
        .optional()
        .describe("Filter events starting from this timestamp."),
      endDate: timestampSchema
        .optional()
        .describe("Filter events ending at this timestamp."),
      initiator: z
        .boolean()
        .optional()
        .describe("Include only events initiated by this account."),
      subjectOnly: z
        .boolean()
        .optional()
        .describe("Filter to events where the account is the main subject."),
    }),
    execute: async ({
      address,
      limit,
      beforeLt,
      startDate,
      endDate,
      initiator,
      subjectOnly,
    }) =>
      client.accounts.getAccountEvents(parseAddress(address), {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate,
        initiator,
        subject_only: subjectOnly,
      }),
  }),
  tonGetAccountEvent: jsonSafeTool({
    description: "Get a specific event for an account.",
    inputSchema: z.object({
      address: addressSchema,
      eventId: z.string().min(1).describe("Event ID or transaction hash."),
      subjectOnly: z
        .boolean()
        .optional()
        .describe("Filter to actions where account is the main subject."),
    }),
    execute: async ({ address, eventId, subjectOnly }) =>
      client.accounts.getAccountEvent(parseAddress(address), eventId, {
        subject_only: subjectOnly,
      }),
  }),
  tonGetAccountTraces: jsonSafeTool({
    description: "Get trace IDs for an account.",
    inputSchema: z.object({
      address: addressSchema,
      beforeLt: ltSchema.optional().describe("Return traces before this lt."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of traces to return."),
    }),
    execute: async ({ address, beforeLt, limit }) =>
      client.accounts.getAccountTraces(parseAddress(address), {
        before_lt: parseLt(beforeLt),
        limit,
      }),
  }),
  tonGetAccountSubscriptions: jsonSafeTool({
    description: "Get active subscriptions for a wallet account.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.getAccountSubscriptions(parseAddress(address)),
  }),
  tonGetAccountMultisigs: jsonSafeTool({
    description: "Get multisig contracts for an account.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.accounts.getAccountMultisigs(parseAddress(address)),
  }),
  tonGetAccountDiff: jsonSafeTool({
    description: "Get balance change for an account over a time range.",
    inputSchema: z.object({
      address: addressSchema,
      startDate: timestampSchema.describe("Start time for the diff."),
      endDate: timestampSchema.describe("End time for the diff."),
    }),
    execute: async ({ address, startDate, endDate }) =>
      client.accounts.getAccountDiff(parseAddress(address), {
        start_date: startDate,
        end_date: endDate,
      }),
  }),
  tonGetAccountExtraCurrencyHistory: jsonSafeTool({
    description: "Get extra currency transfer history for an account.",
    inputSchema: z.object({
      address: addressSchema,
      currencyId: z
        .number()
        .int()
        .describe("Extra currency ID (numeric identifier)."),
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
    execute: async ({
      address,
      currencyId,
      limit,
      beforeLt,
      startDate,
      endDate,
    }) =>
      client.accounts.getAccountExtraCurrencyHistoryById(
        parseAddress(address),
        currencyId,
        {
          limit,
          before_lt: parseLt(beforeLt),
          start_date: startDate,
          end_date: endDate,
        }
      ),
  }),
  tonGetAccountTransactions: jsonSafeTool({
    description: "Get low-level blockchain transactions for an account.",
    inputSchema: z.object({
      address: addressSchema,
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum number of transactions to return."),
      beforeLt: ltSchema
        .optional()
        .describe("Return transactions before this lt."),
      afterLt: ltSchema
        .optional()
        .describe("Return transactions after this lt."),
      sortOrder: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort order by lt."),
    }),
    execute: async ({ address, limit, beforeLt, afterLt, sortOrder }) =>
      client.blockchain.getBlockchainAccountTransactions(
        parseAddress(address),
        {
          limit,
          before_lt: parseLt(beforeLt),
          after_lt: parseLt(afterLt),
          sort_order: sortOrder,
        }
      ),
  }),
  tonGetAccountJettons: jsonSafeTool({
    description: "Get all jetton balances for an account.",
    inputSchema: z.object({
      address: addressSchema,
      currencies: z
        .array(z.string().min(1))
        .optional()
        .describe("Fiat currency codes to include in response."),
      supportedExtensions: z
        .array(z.string().min(1))
        .optional()
        .describe("Supported extensions like custom_payload."),
    }),
    execute: async ({ address, currencies, supportedExtensions }) =>
      client.accounts.getAccountJettonsBalances(parseAddress(address), {
        currencies,
        supported_extensions: supportedExtensions,
      }),
  }),
  tonGetAccountJettonBalance: jsonSafeTool({
    description: "Get a specific jetton balance for an account.",
    inputSchema: z.object({
      address: addressSchema,
      jettonAddress: addressSchema.describe("Jetton master address."),
      currencies: z
        .array(z.string().min(1))
        .optional()
        .describe("Fiat currency codes to include in response."),
      supportedExtensions: z
        .array(z.string().min(1))
        .optional()
        .describe("Supported extensions like custom_payload."),
    }),
    execute: async ({
      address,
      jettonAddress,
      currencies,
      supportedExtensions,
    }) =>
      client.accounts.getAccountJettonBalance(
        parseAddress(address),
        parseAddress(jettonAddress),
        {
          currencies,
          supported_extensions: supportedExtensions,
        }
      ),
  }),
  tonGetAccountJettonsHistory: jsonSafeTool({
    description: "Get jetton transfer history for an account.",
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
      client.accounts.getAccountJettonsHistory(parseAddress(address), {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate,
      }),
  }),
  tonGetAccountJettonHistory: jsonSafeTool({
    description: "Get jetton transfer history for an account and jetton.",
    inputSchema: z.object({
      address: addressSchema,
      jettonAddress: addressSchema.describe("Jetton master address."),
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
    execute: async ({
      address,
      jettonAddress,
      limit,
      beforeLt,
      startDate,
      endDate,
    }) =>
      client.accounts.getAccountJettonHistoryById(
        parseAddress(address),
        parseAddress(jettonAddress),
        {
          limit,
          before_lt: parseLt(beforeLt),
          start_date: startDate,
          end_date: endDate,
        }
      ),
  }),
  tonGetAccountNfts: jsonSafeTool({
    description: "Get NFT items owned by an account.",
    inputSchema: z.object({
      address: addressSchema,
      collection: optionalAddressSchema.describe(
        "Filter by collection address."
      ),
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
      indirectOwnership: z
        .boolean()
        .optional()
        .describe("Include indirectly owned items."),
    }),
    execute: async ({
      address,
      collection,
      limit,
      offset,
      indirectOwnership,
    }) =>
      client.accounts.getAccountNftItems(parseAddress(address), {
        collection: parseOptionalAddress(collection),
        limit,
        offset,
        indirect_ownership: indirectOwnership,
      }),
  }),
  tonGetAccountNftHistory: jsonSafeTool({
    description: "Get NFT transfer history for an account.",
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
      client.nft.getAccountNftHistory(parseAddress(address), {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate,
      }),
  }),
});
