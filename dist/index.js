// src/ton-tools/client.ts
import { TonApiClient } from "@ton-api/client";
var resolveBaseUrl = (options) => {
  if (options.baseUrl) return options.baseUrl;
  if (options.network === "testnet") return "https://testnet.tonapi.io";
  return "https://tonapi.io";
};
var createClient = (options) => new TonApiClient({
  baseUrl: resolveBaseUrl(options),
  apiKey: options.apiKey ?? process.env.TONAPI_API_KEY
});

// src/ton-tools/domains/accounts.ts
import { z as z2 } from "zod";

// src/ton-tools/json-safe-tool.ts
import { tool } from "ai";
var toJsonSafeValue = (value, seen = /* @__PURE__ */ new WeakSet()) => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafeValue(item, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);
    if (value instanceof Date) {
      return value;
    }
    const result = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = toJsonSafeValue(nestedValue, seen);
    }
    return result;
  }
  return value;
};
function jsonSafeTool(definition) {
  return tool({
    ...definition,
    execute: async (input, options) => {
      try {
        return toJsonSafeValue(await definition.execute(input, options));
      } catch (error) {
        if (error instanceof Error && error.message.includes("Unexpected end of JSON input")) {
          throw new Error(
            "TON API returned an empty or invalid JSON response. Verify TONAPI_API_KEY, network/baseUrl, and upstream availability."
          );
        }
        throw error;
      }
    }
  });
}

// src/ton-tools/schemas.ts
import { z } from "zod";
var addressSchema = z.string().min(1).describe("TON account address in raw or user-friendly format.");
var optionalAddressSchema = addressSchema.optional().describe("Optional TON address in raw or user-friendly format.");
var addressListSchema = z.array(addressSchema).min(1).max(1e3).describe("List of TON addresses.");
var publicKeySchema = z.string().min(1).describe("Wallet public key (hex or base64).");
var bocSchema = z.string().min(1).describe("Base64-encoded BOC.");
var ltSchema = z.union([z.string(), z.number().int()]).describe("Logical time (lt). Use string for very large values.");
var timestampSchema = z.number().int().describe("Unix timestamp in seconds.");
var stateInitSchema = z.string().min(1).describe("Base64-encoded state init BOC.");

// src/ton-tools/parsers.ts
import { Address, Cell } from "@ton/core";
var parseAddress = (address) => Address.parse(address);
var parseOptionalAddress = (address) => address ? parseAddress(address) : void 0;
var parseAddresses = (addresses) => addresses.map((address) => parseAddress(address));
var parseLt = (value) => value === void 0 ? void 0 : BigInt(value);
var parseStateInit = (stateInit) => Cell.fromBase64(stateInit);
var parseBocCell = (boc) => {
  const cells = Cell.fromBoc(Buffer.from(boc, "base64"));
  if (cells.length === 0) {
    throw new Error("BOC contains no cells.");
  }
  return { cell: cells[0], cellCount: cells.length };
};

// src/ton-tools/domains/accounts.ts
var createAccountTools = ({ client }) => ({
  tonGetAccount: jsonSafeTool({
    description: "Get account details for a TON address.",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.getAccount(parseAddress(address))
  }),
  tonGetAccountsBulk: jsonSafeTool({
    description: "Get details for multiple accounts in one request.",
    inputSchema: z2.object({
      addresses: addressListSchema.describe("Account addresses to fetch."),
      currency: z2.string().min(1).optional().describe(
        "Optional fiat currency code for balance display. (e.g usd)."
      )
    }),
    execute: async ({ addresses, currency }) => client.accounts.getAccounts(
      {
        accountIds: parseAddresses(addresses)
      },
      {
        currency
      }
    )
  }),
  tonGetAccountPublicKey: jsonSafeTool({
    description: "Get public key for a wallet account.",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.getAccountPublicKey(parseAddress(address))
  }),
  tonReindexAccount: jsonSafeTool({
    description: "Trigger account reindexing in TonAPI (useful for stale indexed data).",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.reindexAccount(parseAddress(address))
  }),
  tonGetAccountDomains: jsonSafeTool({
    description: "Get DNS domains linked to an account.",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.accountDnsBackResolve(parseAddress(address))
  }),
  tonGetAccountDnsExpiring: jsonSafeTool({
    description: "Get expiring .ton DNS records for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      period: z2.number().int().min(1).max(3660).optional().describe("Number of days before expiration to include.")
    }),
    execute: async ({ address, period }) => client.accounts.getAccountDnsExpiring(parseAddress(address), {
      period
    })
  }),
  tonSearchAccounts: jsonSafeTool({
    description: "Search accounts by .ton domain name prefix.",
    inputSchema: z2.object({
      name: z2.string().min(3).max(15).describe("Domain name prefix to search for.")
    }),
    execute: async ({ name }) => client.accounts.searchAccounts({
      name
    })
  }),
  tonGetAccountEvents: jsonSafeTool({
    description: "Get high-level account events derived from traces and actions.",
    inputSchema: z2.object({
      address: addressSchema,
      limit: z2.number().int().min(1).max(100).default(20).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp."),
      initiator: z2.boolean().optional().describe("Include only events initiated by this account."),
      subjectOnly: z2.boolean().optional().describe("Filter to events where the account is the main subject.")
    }),
    execute: async ({
      address,
      limit,
      beforeLt,
      startDate,
      endDate,
      initiator,
      subjectOnly
    }) => client.accounts.getAccountEvents(parseAddress(address), {
      limit,
      before_lt: parseLt(beforeLt),
      start_date: startDate,
      end_date: endDate,
      initiator,
      subject_only: subjectOnly
    })
  }),
  tonGetAccountEvent: jsonSafeTool({
    description: "Get a specific event for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      eventId: z2.string().min(1).describe("Event ID or transaction hash."),
      subjectOnly: z2.boolean().optional().describe("Filter to actions where account is the main subject.")
    }),
    execute: async ({ address, eventId, subjectOnly }) => client.accounts.getAccountEvent(parseAddress(address), eventId, {
      subject_only: subjectOnly
    })
  }),
  tonGetAccountTraces: jsonSafeTool({
    description: "Get trace IDs for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      beforeLt: ltSchema.optional().describe("Return traces before this lt."),
      limit: z2.number().int().min(1).max(1e3).optional().describe("Maximum number of traces to return.")
    }),
    execute: async ({ address, beforeLt, limit }) => client.accounts.getAccountTraces(parseAddress(address), {
      before_lt: parseLt(beforeLt),
      limit
    })
  }),
  tonGetAccountSubscriptions: jsonSafeTool({
    description: "Get active subscriptions for a wallet account.",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.getAccountSubscriptions(parseAddress(address))
  }),
  tonGetAccountMultisigs: jsonSafeTool({
    description: "Get multisig contracts for an account.",
    inputSchema: z2.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.accounts.getAccountMultisigs(parseAddress(address))
  }),
  tonGetAccountDiff: jsonSafeTool({
    description: "Get balance change for an account over a time range.",
    inputSchema: z2.object({
      address: addressSchema,
      startDate: timestampSchema.describe("Start time for the diff."),
      endDate: timestampSchema.describe("End time for the diff.")
    }),
    execute: async ({ address, startDate, endDate }) => client.accounts.getAccountDiff(parseAddress(address), {
      start_date: startDate,
      end_date: endDate
    })
  }),
  tonGetAccountExtraCurrencyHistory: jsonSafeTool({
    description: "Get extra currency transfer history for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      currencyId: z2.number().int().describe("Extra currency ID (numeric identifier)."),
      limit: z2.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp.")
    }),
    execute: async ({
      address,
      currencyId,
      limit,
      beforeLt,
      startDate,
      endDate
    }) => client.accounts.getAccountExtraCurrencyHistoryById(
      parseAddress(address),
      currencyId,
      {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate
      }
    )
  }),
  tonGetAccountTransactions: jsonSafeTool({
    description: "Get low-level blockchain transactions for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      limit: z2.number().int().min(1).max(1e3).default(50).describe("Maximum number of transactions to return."),
      beforeLt: ltSchema.optional().describe("Return transactions before this lt."),
      afterLt: ltSchema.optional().describe("Return transactions after this lt."),
      sortOrder: z2.enum(["asc", "desc"]).optional().describe("Sort order by lt.")
    }),
    execute: async ({ address, limit, beforeLt, afterLt, sortOrder }) => client.blockchain.getBlockchainAccountTransactions(
      parseAddress(address),
      {
        limit,
        before_lt: parseLt(beforeLt),
        after_lt: parseLt(afterLt),
        sort_order: sortOrder
      }
    )
  }),
  tonGetAccountJettons: jsonSafeTool({
    description: "Get all jetton balances for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      currencies: z2.array(z2.string().min(1)).optional().describe("Fiat currency codes to include in response."),
      supportedExtensions: z2.array(z2.string().min(1)).optional().describe("Supported extensions like custom_payload.")
    }),
    execute: async ({ address, currencies, supportedExtensions }) => client.accounts.getAccountJettonsBalances(parseAddress(address), {
      currencies,
      supported_extensions: supportedExtensions
    })
  }),
  tonGetAccountJettonBalance: jsonSafeTool({
    description: "Get a specific jetton balance for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      jettonAddress: addressSchema.describe("Jetton master address."),
      currencies: z2.array(z2.string().min(1)).optional().describe("Fiat currency codes to include in response."),
      supportedExtensions: z2.array(z2.string().min(1)).optional().describe("Supported extensions like custom_payload.")
    }),
    execute: async ({
      address,
      jettonAddress,
      currencies,
      supportedExtensions
    }) => client.accounts.getAccountJettonBalance(
      parseAddress(address),
      parseAddress(jettonAddress),
      {
        currencies,
        supported_extensions: supportedExtensions
      }
    )
  }),
  tonGetAccountJettonsHistory: jsonSafeTool({
    description: "Get jetton transfer history for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      limit: z2.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp.")
    }),
    execute: async ({ address, limit, beforeLt, startDate, endDate }) => client.accounts.getAccountJettonsHistory(parseAddress(address), {
      limit,
      before_lt: parseLt(beforeLt),
      start_date: startDate,
      end_date: endDate
    })
  }),
  tonGetAccountJettonHistory: jsonSafeTool({
    description: "Get jetton transfer history for an account and jetton.",
    inputSchema: z2.object({
      address: addressSchema,
      jettonAddress: addressSchema.describe("Jetton master address."),
      limit: z2.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp.")
    }),
    execute: async ({
      address,
      jettonAddress,
      limit,
      beforeLt,
      startDate,
      endDate
    }) => client.accounts.getAccountJettonHistoryById(
      parseAddress(address),
      parseAddress(jettonAddress),
      {
        limit,
        before_lt: parseLt(beforeLt),
        start_date: startDate,
        end_date: endDate
      }
    )
  }),
  tonGetAccountNfts: jsonSafeTool({
    description: "Get NFT items owned by an account.",
    inputSchema: z2.object({
      address: addressSchema,
      collection: optionalAddressSchema.describe(
        "Filter by collection address."
      ),
      limit: z2.number().int().min(1).max(1e3).default(100).describe("Maximum number of items to return."),
      offset: z2.number().int().min(0).default(0).describe("Offset for pagination."),
      indirectOwnership: z2.boolean().optional().describe("Include indirectly owned items.")
    }),
    execute: async ({
      address,
      collection,
      limit,
      offset,
      indirectOwnership
    }) => client.accounts.getAccountNftItems(parseAddress(address), {
      collection: parseOptionalAddress(collection),
      limit,
      offset,
      indirect_ownership: indirectOwnership
    })
  }),
  tonGetAccountNftHistory: jsonSafeTool({
    description: "Get NFT transfer history for an account.",
    inputSchema: z2.object({
      address: addressSchema,
      limit: z2.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp.")
    }),
    execute: async ({ address, limit, beforeLt, startDate, endDate }) => client.nft.getAccountNftHistory(parseAddress(address), {
      limit,
      before_lt: parseLt(beforeLt),
      start_date: startDate,
      end_date: endDate
    })
  })
});

// src/ton-tools/domains/jettons.ts
import { z as z3 } from "zod";
var createJettonTools = ({ client }) => ({
  tonGetJettons: jsonSafeTool({
    description: "List indexed jetton masters.",
    inputSchema: z3.object({
      limit: z3.number().int().min(1).max(1e3).default(100).describe("Maximum number of jettons to return."),
      offset: z3.number().int().min(0).default(0).describe("Offset for pagination.")
    }),
    execute: async ({ limit, offset }) => client.jettons.getJettons({
      limit,
      offset
    })
  }),
  tonGetJettonInfo: jsonSafeTool({
    description: "Get jetton metadata by jetton master address.",
    inputSchema: z3.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.jettons.getJettonInfo(parseAddress(address))
  }),
  tonGetJettonInfosBulk: jsonSafeTool({
    description: "Get jetton metadata for multiple jetton masters.",
    inputSchema: z3.object({
      addresses: addressListSchema.describe("Jetton master addresses.")
    }),
    execute: async ({ addresses }) => client.jettons.getJettonInfosByAddresses({
      accountIds: parseAddresses(addresses)
    })
  }),
  tonGetJettonHolders: jsonSafeTool({
    description: "Get holders for a jetton master address.",
    inputSchema: z3.object({
      address: addressSchema,
      limit: z3.number().int().min(1).max(1e3).default(1e3).describe("Maximum number of holders to return."),
      offset: z3.number().int().min(0).default(0).describe("Offset for pagination.")
    }),
    execute: async ({ address, limit, offset }) => client.jettons.getJettonHolders(parseAddress(address), {
      limit,
      offset
    })
  }),
  tonGetJettonTransferPayload: jsonSafeTool({
    description: "Get custom payload/state-init required for jetton transfer by account.",
    inputSchema: z3.object({
      address: addressSchema.describe("Owner wallet address."),
      jettonAddress: addressSchema.describe("Jetton master address.")
    }),
    execute: async ({ address, jettonAddress }) => client.jettons.getJettonTransferPayload(
      parseAddress(address),
      parseAddress(jettonAddress)
    )
  }),
  tonGetJettonsEvent: jsonSafeTool({
    description: "Get jetton transfers associated with an event.",
    inputSchema: z3.object({
      eventId: z3.string().min(1).describe("Event ID to inspect.")
    }),
    execute: async ({ eventId }) => client.jettons.getJettonsEvents(eventId)
  })
});

// src/ton-tools/domains/nft.ts
import { z as z4 } from "zod";
var createNftTools = ({ client }) => ({
  tonGetNftCollections: jsonSafeTool({
    description: "List NFT collections.",
    inputSchema: z4.object({
      limit: z4.number().int().min(1).max(1e3).default(100).describe("Maximum number of collections to return."),
      offset: z4.number().int().min(0).default(0).describe("Offset for pagination.")
    }),
    execute: async ({ limit, offset }) => client.nft.getNftCollections({
      limit,
      offset
    })
  }),
  tonGetNftCollection: jsonSafeTool({
    description: "Get NFT collection metadata by collection address.",
    inputSchema: z4.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.nft.getNftCollection(parseAddress(address))
  }),
  tonGetNftCollectionItems: jsonSafeTool({
    description: "Get NFT items from a collection.",
    inputSchema: z4.object({
      collectionAddress: addressSchema.describe("Collection address."),
      limit: z4.number().int().min(1).max(1e3).default(100).describe("Maximum number of items to return."),
      offset: z4.number().int().min(0).default(0).describe("Offset for pagination.")
    }),
    execute: async ({ collectionAddress, limit, offset }) => client.nft.getItemsFromCollection(parseAddress(collectionAddress), {
      limit,
      offset
    })
  }),
  tonGetNftItemsBulk: jsonSafeTool({
    description: "Get NFT items by their addresses.",
    inputSchema: z4.object({
      addresses: addressListSchema.describe("NFT item addresses.")
    }),
    execute: async ({ addresses }) => client.nft.getNftItemsByAddresses({
      accountIds: parseAddresses(addresses)
    })
  }),
  tonGetNftCollectionItemsBulk: jsonSafeTool({
    description: "Get NFT collections by their addresses.",
    inputSchema: z4.object({
      addresses: addressListSchema.describe("Collection addresses.")
    }),
    execute: async ({ addresses }) => client.nft.getNftCollectionItemsByAddresses({
      accountIds: parseAddresses(addresses)
    })
  }),
  tonGetNftItem: jsonSafeTool({
    description: "Get an NFT item by its address.",
    inputSchema: z4.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.nft.getNftItemByAddress(parseAddress(address))
  }),
  tonGetNftHistoryById: jsonSafeTool({
    description: "Get transfer history for a specific NFT item.",
    inputSchema: z4.object({
      address: addressSchema,
      limit: z4.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      startDate: timestampSchema.optional().describe("Filter events starting from this timestamp."),
      endDate: timestampSchema.optional().describe("Filter events ending at this timestamp.")
    }),
    execute: async ({ address, limit, beforeLt, startDate, endDate }) => client.nft.getNftHistoryById(parseAddress(address), {
      limit,
      before_lt: parseLt(beforeLt),
      start_date: startDate,
      end_date: endDate
    })
  })
});

// src/ton-tools/domains/dns.ts
import { z as z5 } from "zod";
var createDnsTools = ({ client }) => ({
  tonResolveDns: jsonSafeTool({
    description: "Resolve a .ton or .t.me DNS name to its record.",
    inputSchema: z5.object({
      domain: z5.string().min(1).describe("Domain name such as alice.ton or bot.t.me.")
    }),
    execute: async ({ domain }) => client.dns.dnsResolve(domain)
  }),
  tonGetDnsInfo: jsonSafeTool({
    description: "Get detailed DNS info for a TON domain.",
    inputSchema: z5.object({
      domain: z5.string().min(1).describe("Domain name such as alice.ton or bot.t.me.")
    }),
    execute: async ({ domain }) => client.dns.getDnsInfo(domain)
  }),
  tonGetDnsBids: jsonSafeTool({
    description: "Get bids for a TON DNS domain.",
    inputSchema: z5.object({
      domain: z5.string().min(1).describe("Domain name such as alice.ton or bot.t.me.")
    }),
    execute: async ({ domain }) => client.dns.getDomainBids(domain)
  }),
  tonGetDnsAuctions: jsonSafeTool({
    description: "Get current DNS auctions.",
    inputSchema: z5.object({
      tld: z5.string().optional().describe('Top-level domain filter: "ton" or "t.me".')
    }),
    execute: async ({ tld }) => client.dns.getAllAuctions({ tld })
  })
});

// src/ton-tools/domains/rates.ts
import { z as z6 } from "zod";
var createRatesTools = ({ client }) => ({
  tonGetRates: jsonSafeTool({
    description: "Get token prices in selected currencies (display only).",
    inputSchema: z6.object({
      tokens: z6.array(z6.string().min(1)).min(1).max(100).describe('Tokens to price, e.g. "ton" or jetton addresses.'),
      currencies: z6.array(z6.string().min(1)).min(1).max(50).describe('Fiat currencies like "usd", "eur".')
    }),
    execute: async ({ tokens, currencies }) => client.rates.getRates({
      tokens,
      currencies
    })
  }),
  tonGetChartRates: jsonSafeTool({
    description: "Get historical price chart for a token.",
    inputSchema: z6.object({
      token: addressSchema.describe("Jetton master address."),
      currency: z6.string().min(1).optional().describe('Fiat currency code like "usd".'),
      startDate: timestampSchema.optional().describe("Chart start timestamp in seconds."),
      endDate: timestampSchema.optional().describe("Chart end timestamp in seconds."),
      pointsCount: z6.number().int().min(0).max(200).optional().describe("Maximum number of points to return.")
    }),
    execute: async ({ token, currency, startDate, endDate, pointsCount }) => client.rates.getChartRates({
      token: parseAddress(token),
      currency,
      start_date: startDate,
      end_date: endDate,
      points_count: pointsCount
    })
  }),
  tonGetMarketsRates: jsonSafeTool({
    description: "Get TON price from markets.",
    inputSchema: z6.object({}),
    execute: async () => client.rates.getMarketsRates()
  })
});

// src/ton-tools/domains/ton-connect.ts
import { z as z7 } from "zod";
var createTonConnectTools = ({ client }) => ({
  tonGetTonConnectPayload: jsonSafeTool({
    description: "Get a TonConnect payload for wallet connection.",
    inputSchema: z7.object({}),
    execute: async () => client.connect.getTonConnectPayload()
  }),
  tonGetAccountInfoByStateInit: jsonSafeTool({
    description: "Get account info from a state init BOC payload.",
    inputSchema: z7.object({
      stateInit: stateInitSchema
    }),
    execute: async ({ stateInit }) => client.connect.getAccountInfoByStateInit({
      stateInit: parseStateInit(stateInit)
    })
  })
});

// src/ton-tools/domains/wallet.ts
import { z as z8 } from "zod";
var createWalletTools = ({ client }) => ({
  tonTonConnectProof: jsonSafeTool({
    description: "Verify TonConnect proof and issue auth token via TonAPI.",
    inputSchema: z8.object({
      address: addressSchema,
      proof: z8.object({
        timestamp: z8.number().int().describe("Unix timestamp."),
        domain: z8.object({
          lengthBytes: z8.number().int().optional(),
          value: z8.string().min(1)
        }),
        signature: z8.string().min(1),
        payload: z8.string().min(1),
        stateInit: stateInitSchema.optional()
      })
    }),
    execute: async ({ address, proof }) => client.wallet.tonConnectProof({
      address: parseAddress(address),
      proof: {
        timestamp: proof.timestamp,
        domain: {
          lengthBytes: proof.domain.lengthBytes,
          value: proof.domain.value
        },
        signature: proof.signature,
        payload: proof.payload,
        stateInit: proof.stateInit ? parseStateInit(proof.stateInit) : void 0
      }
    })
  }),
  tonGetAccountSeqno: jsonSafeTool({
    description: "Get wallet seqno for an account.",
    inputSchema: z8.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.wallet.getAccountSeqno(parseAddress(address))
  }),
  tonGetWalletsByPublicKey: jsonSafeTool({
    description: "Get wallet accounts by public key.",
    inputSchema: z8.object({
      publicKey: publicKeySchema
    }),
    execute: async ({ publicKey }) => client.wallet.getWalletsByPublicKey(publicKey)
  })
});

// src/ton-tools/domains/staking.ts
import { z as z9 } from "zod";
var createStakingTools = ({ client }) => ({
  tonGetStakingPools: jsonSafeTool({
    description: "List staking pools available in the network.",
    inputSchema: z9.object({
      availableFor: optionalAddressSchema.describe(
        "Account address to filter pools available for that account."
      ),
      includeUnverified: z9.boolean().optional().describe("Include pools not in the whitelist.")
    }),
    execute: async ({ availableFor, includeUnverified }) => client.staking.getStakingPools({
      available_for: parseOptionalAddress(availableFor),
      include_unverified: includeUnverified
    })
  }),
  tonGetStakingPoolInfo: jsonSafeTool({
    description: "Get staking pool info by address.",
    inputSchema: z9.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.staking.getStakingPoolInfo(parseAddress(address))
  }),
  tonGetStakingPoolHistory: jsonSafeTool({
    description: "Get staking pool history by address.",
    inputSchema: z9.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.staking.getStakingPoolHistory(parseAddress(address))
  }),
  tonGetAccountNominatorPools: jsonSafeTool({
    description: "List staking pools where the account is a nominator.",
    inputSchema: z9.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.staking.getAccountNominatorsPools(parseAddress(address))
  })
});

// src/ton-tools/domains/storage.ts
import { z as z10 } from "zod";
var createStorageTools = ({ client }) => ({
  tonGetStorageProviders: jsonSafeTool({
    description: "Get TON storage providers.",
    inputSchema: z10.object({}),
    execute: async () => client.storage.getStorageProviders()
  })
});

// src/ton-tools/domains/trace.ts
import { z as z11 } from "zod";
var createTraceTools = ({ client }) => ({
  tonGetTrace: jsonSafeTool({
    description: "Get a trace by trace ID or transaction hash.",
    inputSchema: z11.object({
      traceId: z11.string().min(1).describe("Trace ID or transaction hash.")
    }),
    execute: async ({ traceId }) => client.traces.getTrace(traceId)
  })
});

// src/ton-tools/domains/event.ts
import { z as z12 } from "zod";
var createEventTools = ({ client }) => ({
  tonGetEvent: jsonSafeTool({
    description: "Get an event by event ID or transaction hash.",
    inputSchema: z12.object({
      eventId: z12.string().min(1).describe("Event ID or transaction hash.")
    }),
    execute: async ({ eventId }) => client.events.getEvent(eventId)
  })
});

// src/ton-tools/domains/emulation.ts
import {
  contractAddress,
  loadMessage,
  loadMessageRelaxed,
  loadStateInit,
  loadTransaction
} from "@ton/core";
import { z as z13 } from "zod";

// src/ton-tools/formatters.ts
var formatAddress = (address) => address ? address.toString() : null;
var formatExternalAddress = (address) => address ? address.toString() : null;
var formatCurrencyCollection = (value) => {
  const other = value.other && value.other.size > 0 ? [...value.other].map(([id, amount]) => ({
    id,
    amount: amount.toString()
  })) : void 0;
  return {
    coins: value.coins.toString(),
    other
  };
};
var formatCellSummary = (cell, includeBoc = false) => ({
  hash: cell.hash().toString("hex"),
  bits: cell.bits.length,
  refs: cell.refs.length,
  isExotic: cell.isExotic,
  ...includeBoc ? { boc: cell.toBoc().toString("base64") } : {}
});
var formatStateInit = (init, options) => {
  if (!init) {
    return null;
  }
  return {
    splitDepth: init.splitDepth ?? null,
    special: init.special ?? null,
    code: init.code ? formatCellSummary(init.code, options?.includeCodeBoc) : null,
    data: init.data ? formatCellSummary(init.data, options?.includeDataBoc) : null,
    librariesCount: init.libraries ? init.libraries.size : 0
  };
};
var formatMessageInfo = (info) => {
  if (info.type === "internal") {
    return {
      type: info.type,
      ihrDisabled: info.ihrDisabled,
      bounce: info.bounce,
      bounced: info.bounced,
      src: formatAddress(info.src),
      dest: formatAddress(info.dest),
      value: formatCurrencyCollection(info.value),
      ihrFee: info.ihrFee.toString(),
      forwardFee: info.forwardFee.toString(),
      createdLt: info.createdLt.toString(),
      createdAt: info.createdAt
    };
  }
  if (info.type === "external-in") {
    return {
      type: info.type,
      src: formatExternalAddress(info.src ?? null),
      dest: formatAddress(info.dest),
      importFee: info.importFee.toString()
    };
  }
  return {
    type: info.type,
    src: formatAddress(info.src),
    dest: formatExternalAddress(info.dest ?? null),
    createdLt: info.createdLt.toString(),
    createdAt: info.createdAt
  };
};
var formatMessageInfoRelaxed = (info) => {
  if (info.type === "internal") {
    return {
      type: info.type,
      ihrDisabled: info.ihrDisabled,
      bounce: info.bounce,
      bounced: info.bounced,
      src: formatAddress(info.src ?? null),
      dest: formatAddress(info.dest),
      value: formatCurrencyCollection(info.value),
      ihrFee: info.ihrFee.toString(),
      forwardFee: info.forwardFee.toString(),
      createdLt: info.createdLt.toString(),
      createdAt: info.createdAt
    };
  }
  return {
    type: info.type,
    src: formatAddress(info.src ?? null),
    dest: formatExternalAddress(info.dest ?? null),
    createdLt: info.createdLt.toString(),
    createdAt: info.createdAt
  };
};
var formatMessage = (message, options) => ({
  info: formatMessageInfo(message.info),
  init: formatStateInit(message.init ?? null, {
    includeCodeBoc: options?.includeInitBoc,
    includeDataBoc: options?.includeInitBoc
  }),
  body: formatCellSummary(message.body, options?.includeBodyBoc)
});
var formatMessageRelaxed = (message, options) => ({
  info: formatMessageInfoRelaxed(message.info),
  init: formatStateInit(message.init ?? null, {
    includeCodeBoc: options?.includeInitBoc,
    includeDataBoc: options?.includeInitBoc
  }),
  body: formatCellSummary(message.body, options?.includeBodyBoc)
});
var formatTransactionDescription = (description) => {
  switch (description.type) {
    case "generic":
      return {
        type: description.type,
        aborted: description.aborted,
        destroyed: description.destroyed
      };
    case "tick-tock":
      return {
        type: description.type,
        isTock: description.isTock,
        aborted: description.aborted,
        destroyed: description.destroyed
      };
    case "split-install":
      return {
        type: description.type,
        installed: description.installed
      };
    case "merge-prepare":
      return {
        type: description.type,
        aborted: description.aborted
      };
    case "merge-install":
      return {
        type: description.type,
        aborted: description.aborted,
        destroyed: description.destroyed
      };
    default:
      return { type: description.type };
  }
};
var formatTransaction = (transaction, options) => {
  const outMessages = options?.includeMessages === false ? void 0 : [...transaction.outMessages].map(([key, message]) => ({
    key,
    message: formatMessage(message, {
      includeBodyBoc: options?.includeBodyBoc,
      includeInitBoc: options?.includeInitBoc
    })
  }));
  return {
    address: transaction.address.toString(16).padStart(64, "0"),
    lt: transaction.lt.toString(),
    prevTransactionHash: transaction.prevTransactionHash.toString(16).padStart(64, "0"),
    prevTransactionLt: transaction.prevTransactionLt.toString(),
    now: transaction.now,
    outMessagesCount: transaction.outMessagesCount,
    oldStatus: transaction.oldStatus,
    endStatus: transaction.endStatus,
    inMessage: transaction.inMessage ? formatMessage(transaction.inMessage, {
      includeBodyBoc: options?.includeBodyBoc,
      includeInitBoc: options?.includeInitBoc
    }) : null,
    outMessages,
    totalFees: formatCurrencyCollection(transaction.totalFees),
    description: formatTransactionDescription(transaction.description),
    hash: transaction.hash().toString("hex")
  };
};

// src/ton-tools/domains/emulation.ts
var createEmulationTools = ({ client }) => ({
  tonDecodeMessageBoc: jsonSafeTool({
    description: "Decode a TON message BOC locally.",
    inputSchema: z13.object({
      boc: bocSchema,
      relaxed: z13.boolean().optional().describe("Decode as relaxed message (MessageRelaxed)."),
      includeBodyBoc: z13.boolean().optional().describe("Include base64 body BOC in response."),
      includeInitBoc: z13.boolean().optional().describe("Include base64 init code/data in response.")
    }),
    execute: async ({ boc, relaxed, includeBodyBoc, includeInitBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);
      if (relaxed) {
        const message2 = loadMessageRelaxed(cell.beginParse());
        return {
          cellCount,
          message: formatMessageRelaxed(message2, {
            includeBodyBoc,
            includeInitBoc
          })
        };
      }
      const message = loadMessage(cell.beginParse());
      return {
        cellCount,
        message: formatMessage(message, { includeBodyBoc, includeInitBoc })
      };
    }
  }),
  tonDecodeTransactionBoc: jsonSafeTool({
    description: "Decode a TON transaction BOC locally.",
    inputSchema: z13.object({
      boc: bocSchema,
      includeMessages: z13.boolean().optional().describe("Include decoded in/out messages in response."),
      includeBodyBoc: z13.boolean().optional().describe("Include base64 body BOC in message summaries."),
      includeInitBoc: z13.boolean().optional().describe("Include base64 init code/data in message summaries.")
    }),
    execute: async ({
      boc,
      includeMessages,
      includeBodyBoc,
      includeInitBoc
    }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const transaction = loadTransaction(cell.beginParse());
      return {
        cellCount,
        transaction: formatTransaction(transaction, {
          includeMessages,
          includeBodyBoc,
          includeInitBoc
        })
      };
    }
  }),
  tonDecodeStateInitBoc: jsonSafeTool({
    description: "Decode a state init BOC locally.",
    inputSchema: z13.object({
      boc: bocSchema,
      workchain: z13.number().int().optional().describe("Workchain ID to compute contract address."),
      includeCodeBoc: z13.boolean().optional().describe("Include base64 code BOC in response."),
      includeDataBoc: z13.boolean().optional().describe("Include base64 data BOC in response.")
    }),
    execute: async ({ boc, workchain, includeCodeBoc, includeDataBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const init = loadStateInit(cell.beginParse());
      const address = workchain === void 0 ? null : contractAddress(workchain, init);
      return {
        cellCount,
        address: address ? formatAddress(address) : null,
        stateInit: formatStateInit(init, {
          includeCodeBoc,
          includeDataBoc
        })
      };
    }
  }),
  tonComputeAddressFromStateInit: jsonSafeTool({
    description: "Compute contract address from a state init BOC locally.",
    inputSchema: z13.object({
      boc: bocSchema,
      workchain: z13.number().int().default(0).describe("Workchain ID (default 0).")
    }),
    execute: async ({ boc, workchain }) => {
      const { cell } = parseBocCell(boc);
      const init = loadStateInit(cell.beginParse());
      return {
        address: formatAddress(contractAddress(workchain, init))
      };
    }
  }),
  tonDecodeMessageApi: jsonSafeTool({
    description: "Decode a message BOC via TonAPI emulation endpoint.",
    inputSchema: z13.object({
      boc: bocSchema
    }),
    execute: async ({ boc }) => client.emulation.decodeMessage({
      boc: parseBocCell(boc).cell
    })
  }),
  tonEmulateMessageToEvent: jsonSafeTool({
    description: "Emulate sending a message and return resulting event.",
    inputSchema: z13.object({
      boc: bocSchema,
      ignoreSignatureCheck: z13.boolean().optional().describe("Ignore message signature check during emulation.")
    }),
    execute: async ({ boc, ignoreSignatureCheck }) => client.emulation.emulateMessageToEvent(
      {
        boc: parseBocCell(boc).cell
      },
      {
        ignore_signature_check: ignoreSignatureCheck
      }
    )
  }),
  tonEmulateMessageToTrace: jsonSafeTool({
    description: "Emulate sending a message and return resulting trace.",
    inputSchema: z13.object({
      boc: bocSchema,
      ignoreSignatureCheck: z13.boolean().optional().describe("Ignore message signature check during emulation.")
    }),
    execute: async ({ boc, ignoreSignatureCheck }) => client.emulation.emulateMessageToTrace(
      {
        boc: parseBocCell(boc).cell
      },
      {
        ignore_signature_check: ignoreSignatureCheck
      }
    )
  }),
  tonEmulateMessageToWallet: jsonSafeTool({
    description: "Emulate message execution with optional per-account settings.",
    inputSchema: z13.object({
      boc: bocSchema,
      params: z13.array(
        z13.object({
          address: addressSchema,
          balance: ltSchema.optional().describe("Optional account balance override.")
        })
      ).optional().describe("Optional account configuration for emulation.")
    }),
    execute: async ({ boc, params }) => client.emulation.emulateMessageToWallet({
      boc: parseBocCell(boc).cell,
      params: params?.map((param) => ({
        address: parseAddress(param.address),
        balance: parseLt(param.balance)
      }))
    })
  }),
  tonEmulateMessageToAccountEvent: jsonSafeTool({
    description: "Emulate a message against a specific account and return event.",
    inputSchema: z13.object({
      address: addressSchema,
      boc: bocSchema,
      ignoreSignatureCheck: z13.boolean().optional().describe("Ignore message signature check during emulation.")
    }),
    execute: async ({ address, boc, ignoreSignatureCheck }) => client.emulation.emulateMessageToAccountEvent(
      parseAddress(address),
      {
        boc: parseBocCell(boc).cell
      },
      {
        ignore_signature_check: ignoreSignatureCheck
      }
    )
  })
});

// src/ton-tools/domains/blockchain.ts
import { z as z14 } from "zod";
var createBlockchainTools = ({ client }) => ({
  tonGetReducedBlockchainBlocks: jsonSafeTool({
    description: "Get reduced blockchain block data for a seqno range.",
    inputSchema: z14.object({
      from: z14.number().int().describe("Start masterchain seqno (inclusive)."),
      to: z14.number().int().describe("End masterchain seqno (inclusive).")
    }),
    execute: async ({ from, to }) => client.blockchain.getReducedBlockchainBlocks({
      from,
      to
    })
  }),
  tonGetMasterchainHead: jsonSafeTool({
    description: "Get the latest known masterchain block.",
    inputSchema: z14.object({}),
    execute: async () => client.blockchain.getBlockchainMasterchainHead()
  }),
  tonGetMasterchainShards: jsonSafeTool({
    description: "Get shard blocks for a masterchain seqno.",
    inputSchema: z14.object({
      masterchainSeqno: z14.number().int().describe("Masterchain seqno.")
    }),
    execute: async ({ masterchainSeqno }) => client.blockchain.getBlockchainMasterchainShards(masterchainSeqno)
  }),
  tonGetMasterchainBlocks: jsonSafeTool({
    description: "Get all blocks linked to a masterchain seqno snapshot.",
    inputSchema: z14.object({
      masterchainSeqno: z14.number().int().describe("Masterchain seqno.")
    }),
    execute: async ({ masterchainSeqno }) => client.blockchain.getBlockchainMasterchainBlocks(masterchainSeqno)
  }),
  tonGetMasterchainTransactions: jsonSafeTool({
    description: "Get all transactions linked to a masterchain seqno snapshot.",
    inputSchema: z14.object({
      masterchainSeqno: z14.number().int().describe("Masterchain seqno.")
    }),
    execute: async ({ masterchainSeqno }) => client.blockchain.getBlockchainMasterchainTransactions(masterchainSeqno)
  }),
  tonGetBlock: jsonSafeTool({
    description: "Get a blockchain block by block ID.",
    inputSchema: z14.object({
      blockId: z14.string().min(1).describe("Block ID string like (workchain,shard,seqno).")
    }),
    execute: async ({ blockId }) => client.blockchain.getBlockchainBlock(blockId)
  }),
  tonGetBlockTransactions: jsonSafeTool({
    description: "Get transactions from a blockchain block.",
    inputSchema: z14.object({
      blockId: z14.string().min(1).describe("Block ID string like (workchain,shard,seqno).")
    }),
    execute: async ({ blockId }) => client.blockchain.getBlockchainBlockTransactions(blockId)
  }),
  tonGetTransaction: jsonSafeTool({
    description: "Get a transaction by transaction ID.",
    inputSchema: z14.object({
      transactionId: z14.string().min(1).describe("Transaction hash string.")
    }),
    execute: async ({ transactionId }) => client.blockchain.getBlockchainTransaction(transactionId)
  }),
  tonGetTransactionByMessageHash: jsonSafeTool({
    description: "Get a transaction by message hash.",
    inputSchema: z14.object({
      messageHash: z14.string().min(1).describe("Message hash string.")
    }),
    execute: async ({ messageHash }) => client.blockchain.getBlockchainTransactionByMessageHash(messageHash)
  }),
  tonGetValidators: jsonSafeTool({
    description: "Get current blockchain validators.",
    inputSchema: z14.object({}),
    execute: async () => client.blockchain.getBlockchainValidators()
  }),
  tonGetBlockchainConfig: jsonSafeTool({
    description: "Get current blockchain config.",
    inputSchema: z14.object({}),
    execute: async () => client.blockchain.getBlockchainConfig()
  }),
  tonGetBlockchainConfigFromBlock: jsonSafeTool({
    description: "Get blockchain config at a specific masterchain seqno.",
    inputSchema: z14.object({
      masterchainSeqno: z14.number().int().describe("Masterchain seqno.")
    }),
    execute: async ({ masterchainSeqno }) => client.blockchain.getBlockchainConfigFromBlock(masterchainSeqno)
  }),
  tonGetRawBlockchainConfig: jsonSafeTool({
    description: "Get raw blockchain config cells.",
    inputSchema: z14.object({}),
    execute: async () => client.blockchain.getRawBlockchainConfig()
  }),
  tonGetRawBlockchainConfigFromBlock: jsonSafeTool({
    description: "Get raw blockchain config from a specific masterchain seqno.",
    inputSchema: z14.object({
      masterchainSeqno: z14.number().int().describe("Masterchain seqno.")
    }),
    execute: async ({ masterchainSeqno }) => client.blockchain.getRawBlockchainConfigFromBlock(masterchainSeqno)
  }),
  tonGetBlockchainRawAccount: jsonSafeTool({
    description: "Get low-level blockchain account state.",
    inputSchema: z14.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.blockchain.getBlockchainRawAccount(parseAddress(address))
  }),
  tonInspectBlockchainAccount: jsonSafeTool({
    description: "Inspect derived account metadata from blockchain state.",
    inputSchema: z14.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.blockchain.blockchainAccountInspect(parseAddress(address))
  }),
  tonGetBlockchainStatus: jsonSafeTool({
    description: "Get TonAPI service status from blockchain namespace.",
    inputSchema: z14.object({}),
    execute: async () => client.blockchain.status()
  }),
  tonExecGetMethod: jsonSafeTool({
    description: "Execute a get method for a blockchain account.",
    inputSchema: z14.object({
      address: addressSchema,
      methodName: z14.string().min(1).describe("Get method name, e.g. get_wallet_data."),
      args: z14.array(z14.string()).optional().describe(
        "Method arguments as strings (addresses, hex ints, or BOC values)."
      ),
      fixOrder: z14.boolean().optional().describe("Use TonAPI argument order workaround if needed.")
    }),
    execute: async ({ address, methodName, args, fixOrder }) => client.blockchain.execGetMethodForBlockchainAccount(
      parseAddress(address),
      methodName,
      {
        args,
        fix_order: fixOrder
      }
    )
  })
});

// src/ton-tools/domains/utility.ts
import { Address as Address2 } from "@ton/core";
import { z as z15 } from "zod";
var createUtilityTools = ({ client }) => ({
  tonGetTonApiStatus: jsonSafeTool({
    description: "Get TonAPI service status.",
    inputSchema: z15.object({}),
    execute: async () => client.utilities.status()
  }),
  tonGetTonApiOpenapiJson: jsonSafeTool({
    description: "Get TonAPI OpenAPI specification JSON.",
    inputSchema: z15.object({}),
    execute: async () => client.utilities.getOpenapiJson()
  }),
  tonAddressParseApi: jsonSafeTool({
    description: "Parse an address via TonAPI parser endpoint.",
    inputSchema: z15.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.utilities.addressParse(parseAddress(address))
  }),
  tonAddressParse: jsonSafeTool({
    description: "Parse an address and display it in all formats.",
    inputSchema: z15.object({
      address: addressSchema
    }),
    execute: async ({ address }) => {
      const parsed = parseAddress(address);
      const isFriendly = Address2.isFriendly(address);
      const isRaw = Address2.isRaw(address);
      const friendly = isFriendly ? Address2.parseFriendly(address) : { isBounceable: null, isTestOnly: null };
      return {
        raw: parsed.toRawString(),
        workchain: parsed.workChain,
        hash: parsed.hash.toString("hex"),
        friendly: {
          bounceable: parsed.toString({ bounceable: true, testOnly: false }),
          nonBounceable: parsed.toString({
            bounceable: false,
            testOnly: false
          }),
          bounceableTestnet: parsed.toString({
            bounceable: true,
            testOnly: true
          }),
          nonBounceableTestnet: parsed.toString({
            bounceable: false,
            testOnly: true
          })
        },
        flags: {
          isFriendly,
          isRaw,
          isBounceable: friendly.isBounceable,
          isTestOnly: friendly.isTestOnly
        }
      };
    }
  })
});

// src/ton-tools/domains/inscriptions.ts
import { z as z16 } from "zod";
var createInscriptionsTools = ({ client }) => ({
  tonGetAccountInscriptions: jsonSafeTool({
    description: "Get inscription balances for an account (experimental API).",
    inputSchema: z16.object({
      address: addressSchema,
      limit: z16.number().int().min(1).max(1e3).default(1e3).describe("Maximum number of records to return."),
      offset: z16.number().int().min(0).default(0).describe("Offset for pagination.")
    }),
    execute: async ({ address, limit, offset }) => client.inscriptions.getAccountInscriptions(parseAddress(address), {
      limit,
      offset
    })
  }),
  tonGetAccountInscriptionsHistory: jsonSafeTool({
    description: "Get account inscription transfer history (experimental API).",
    inputSchema: z16.object({
      address: addressSchema,
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      limit: z16.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return.")
    }),
    execute: async ({ address, beforeLt, limit }) => client.inscriptions.getAccountInscriptionsHistory(parseAddress(address), {
      before_lt: parseLt(beforeLt),
      limit
    })
  }),
  tonGetAccountInscriptionsHistoryByTicker: jsonSafeTool({
    description: "Get inscription transfer history for an account and ticker (experimental API).",
    inputSchema: z16.object({
      address: addressSchema,
      ticker: z16.string().min(1).describe("Inscription ticker."),
      beforeLt: ltSchema.optional().describe("Return events before this lt."),
      limit: z16.number().int().min(1).max(1e3).default(100).describe("Maximum number of events to return.")
    }),
    execute: async ({ address, ticker, beforeLt, limit }) => client.inscriptions.getAccountInscriptionsHistoryByTicker(
      parseAddress(address),
      ticker,
      {
        before_lt: parseLt(beforeLt),
        limit
      }
    )
  }),
  tonGetInscriptionOpTemplate: jsonSafeTool({
    description: "Get comment template for inscription operations (experimental API).",
    inputSchema: z16.object({
      type: z16.enum(["ton20", "gram20"]).describe("Inscription standard type."),
      operation: z16.enum(["transfer"]).default("transfer").describe("Inscription operation."),
      amount: ltSchema.describe("Amount in base units."),
      ticker: z16.string().min(1).describe("Inscription ticker."),
      who: z16.string().min(1).describe("Recipient account string."),
      destination: z16.string().min(1).optional().describe("Optional destination address string."),
      comment: z16.string().min(1).optional().describe("Optional comment override.")
    }),
    execute: async ({
      type,
      operation,
      amount,
      ticker,
      who,
      destination,
      comment: comment2
    }) => client.inscriptions.getInscriptionOpTemplate({
      type,
      operation,
      amount: parseLt(amount),
      ticker,
      who,
      destination,
      comment: comment2
    })
  })
});

// src/ton-tools/domains/extra-currency.ts
import { z as z17 } from "zod";
var createExtraCurrencyTools = ({ client }) => ({
  tonGetExtraCurrencyInfo: jsonSafeTool({
    description: "Get metadata for an extra currency ID.",
    inputSchema: z17.object({
      currencyId: z17.number().int().describe("Extra currency ID.")
    }),
    execute: async ({ currencyId }) => client.extraCurrency.getExtraCurrencyInfo(currencyId)
  })
});

// src/ton-tools/domains/multisig.ts
import { z as z18 } from "zod";
var createMultisigTools = ({ client }) => ({
  tonGetMultisigAccountInfo: jsonSafeTool({
    description: "Get detailed multisig account data by address.",
    inputSchema: z18.object({
      address: addressSchema
    }),
    execute: async ({ address }) => client.multisig.getMultisigAccount(parseAddress(address))
  })
});

// src/ton-tools/domains/write.ts
import {
  Cell as Cell2,
  beginCell,
  comment,
  external,
  loadStateInit as loadStateInit2,
  safeSign,
  safeSignVerify,
  storeMessage
} from "@ton/core";
import {
  mnemonicNew,
  mnemonicToWalletKey,
  mnemonicValidate,
  sign,
  signVerify
} from "@ton/crypto";
import { z as z19 } from "zod";
var bigintLikeSchema = z19.union([z19.string().min(1), z19.number().int()]).describe("Integer value as decimal string or integer number.");
var dataEncodingSchema = z19.enum(["utf8", "hex", "base64"]).describe("Binary data encoding.");
var outputEncodingSchema = z19.enum(["utf8", "hex", "base64"]).describe("Output encoding.");
var keyEncodingSchema = z19.enum(["hex", "base64"]).describe("Key/signature encoding.");
var numberModeSchema = z19.enum(["string", "number"]).describe("Return integer as string (safe) or JS number (safe-range only).");
var mnemonicInputSchema = z19.union([
  z19.string().min(1).describe("Mnemonic phrase string."),
  z19.array(z19.string().min(1)).min(12).describe("Mnemonic phrase word array.")
]);
var normalizeMnemonic = (input) => {
  if (Array.isArray(input)) {
    return input.map((word) => word.trim()).filter((word) => word.length > 0);
  }
  return input.trim().split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 0);
};
var decodeBuffer = (value, encoding, label) => {
  if (encoding === "hex") {
    if (value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
      throw new Error(`${label} must be valid even-length hex.`);
    }
  }
  return Buffer.from(value, encoding);
};
var decodeKeyBuffer = (value, encoding, label) => decodeBuffer(value, encoding, label);
var encodeBuffer = (value, encoding) => value.toString(encoding);
var parseBigIntLike = (value, label) => {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be a valid integer value.`);
  }
};
var toNumberModeValue = (value, mode) => {
  if (mode === "string") {
    return value.toString();
  }
  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error("Value does not fit in JS safe integer range.");
  }
  return asNumber;
};
var buildOperationSchema = z19.discriminatedUnion("type", [
  z19.object({
    type: z19.literal("bit"),
    value: z19.union([z19.boolean(), z19.number().int()]).describe("Bit value.")
  }),
  z19.object({
    type: z19.literal("uint"),
    value: bigintLikeSchema,
    bits: z19.number().int().min(1).max(256).describe("Bit width.")
  }),
  z19.object({
    type: z19.literal("int"),
    value: bigintLikeSchema,
    bits: z19.number().int().min(1).max(257).describe("Bit width.")
  }),
  z19.object({
    type: z19.literal("varUint"),
    value: bigintLikeSchema,
    bits: z19.number().int().min(1).max(16).describe("Header bit width.")
  }),
  z19.object({
    type: z19.literal("varInt"),
    value: bigintLikeSchema,
    bits: z19.number().int().min(1).max(16).describe("Header bit width.")
  }),
  z19.object({
    type: z19.literal("coins"),
    value: bigintLikeSchema
  }),
  z19.object({
    type: z19.literal("address"),
    value: addressSchema.nullable().optional().describe("Internal address or null for empty address.")
  }),
  z19.object({
    type: z19.literal("buffer"),
    value: z19.string().describe("Buffer data."),
    encoding: dataEncodingSchema.default("utf8"),
    bytes: z19.number().int().min(1).optional().describe("Optional exact byte width.")
  }),
  z19.object({
    type: z19.literal("stringTail"),
    value: z19.string().describe("Tail string.")
  }),
  z19.object({
    type: z19.literal("stringRefTail"),
    value: z19.string().describe("Tail string in ref.")
  }),
  z19.object({
    type: z19.literal("bocRef"),
    boc: bocSchema.describe("Referenced cell BOC.")
  }),
  z19.object({
    type: z19.literal("bocSlice"),
    boc: bocSchema.describe("Slice source BOC.")
  }),
  z19.object({
    type: z19.literal("maybeRef"),
    boc: bocSchema.optional().describe("Ref cell BOC. Omit for null ref.")
  })
]);
var sliceOperationSchema = z19.discriminatedUnion("type", [
  z19.object({
    type: z19.literal("skip"),
    bits: z19.number().int().min(0).describe("Bits to skip."),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("remaining"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadBit"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadBoolean"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadUint"),
    bits: z19.number().int().min(1).max(256),
    mode: numberModeSchema.default("string"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadInt"),
    bits: z19.number().int().min(1).max(257),
    mode: numberModeSchema.default("string"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadVarUint"),
    bits: z19.number().int().min(1).max(16),
    mode: numberModeSchema.default("string"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadVarInt"),
    bits: z19.number().int().min(1).max(16),
    mode: numberModeSchema.default("string"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadCoins"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadAddress"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadMaybeAddress"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadAddressAny"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadBuffer"),
    bytes: z19.number().int().min(1).describe("Bytes to load."),
    outputEncoding: outputEncodingSchema.default("hex"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadBits"),
    bits: z19.number().int().min(1).describe("Bits to load."),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadStringTail"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadMaybeStringTail"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadStringRefTail"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadMaybeStringRefTail"),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadRef"),
    includeBoc: z19.boolean().default(true),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("loadMaybeRef"),
    includeBoc: z19.boolean().default(true),
    name: z19.string().optional()
  }),
  z19.object({
    type: z19.literal("endParse"),
    name: z19.string().optional()
  })
]);
var applyBuildOperation = (target, operation) => {
  switch (operation.type) {
    case "bit":
      target.storeBit(operation.value);
      return;
    case "uint":
      target.storeUint(parseBigIntLike(operation.value, "uint"), operation.bits);
      return;
    case "int":
      target.storeInt(parseBigIntLike(operation.value, "int"), operation.bits);
      return;
    case "varUint":
      target.storeVarUint(
        parseBigIntLike(operation.value, "varUint"),
        operation.bits
      );
      return;
    case "varInt":
      target.storeVarInt(
        parseBigIntLike(operation.value, "varInt"),
        operation.bits
      );
      return;
    case "coins":
      target.storeCoins(parseBigIntLike(operation.value, "coins"));
      return;
    case "address":
      target.storeAddress(operation.value ? parseAddress(operation.value) : null);
      return;
    case "buffer":
      target.storeBuffer(
        decodeBuffer(operation.value, operation.encoding, "buffer"),
        operation.bytes
      );
      return;
    case "stringTail":
      target.storeStringTail(operation.value);
      return;
    case "stringRefTail":
      target.storeStringRefTail(operation.value);
      return;
    case "bocRef":
      target.storeRef(parseBocCell(operation.boc).cell);
      return;
    case "bocSlice":
      target.storeSlice(parseBocCell(operation.boc).cell.beginParse());
      return;
    case "maybeRef":
      target.storeMaybeRef(operation.boc ? parseBocCell(operation.boc).cell : null);
      return;
  }
};
var executeSliceOperation = (slice, operation) => {
  switch (operation.type) {
    case "skip":
      slice.skip(operation.bits);
      return { skippedBits: operation.bits };
    case "remaining":
      return {
        remainingBits: slice.remainingBits,
        remainingRefs: slice.remainingRefs
      };
    case "loadBit":
      return slice.loadBit();
    case "loadBoolean":
      return slice.loadBoolean();
    case "loadUint":
      return toNumberModeValue(slice.loadUintBig(operation.bits), operation.mode);
    case "loadInt":
      return toNumberModeValue(slice.loadIntBig(operation.bits), operation.mode);
    case "loadVarUint":
      return toNumberModeValue(slice.loadVarUintBig(operation.bits), operation.mode);
    case "loadVarInt":
      return toNumberModeValue(slice.loadVarIntBig(operation.bits), operation.mode);
    case "loadCoins":
      return slice.loadCoins().toString();
    case "loadAddress":
      return slice.loadAddress().toString();
    case "loadMaybeAddress":
      return slice.loadMaybeAddress()?.toString() ?? null;
    case "loadAddressAny":
      return slice.loadAddressAny()?.toString() ?? null;
    case "loadBuffer":
      return encodeBuffer(
        slice.loadBuffer(operation.bytes),
        operation.outputEncoding
      );
    case "loadBits": {
      const bits = slice.loadBits(operation.bits);
      const byteAligned = bits.length % 8 === 0 ? bits.subbuffer(0, bits.length) : null;
      return {
        bits: bits.toString(),
        length: bits.length,
        byteAlignedHex: byteAligned?.toString("hex") ?? null,
        byteAlignedBase64: byteAligned?.toString("base64") ?? null
      };
    }
    case "loadStringTail":
      return slice.loadStringTail();
    case "loadMaybeStringTail":
      return slice.loadMaybeStringTail();
    case "loadStringRefTail":
      return slice.loadStringRefTail();
    case "loadMaybeStringRefTail":
      return slice.loadMaybeStringRefTail();
    case "loadRef":
      return formatCellSummary(slice.loadRef(), operation.includeBoc);
    case "loadMaybeRef": {
      const loaded = slice.loadMaybeRef();
      return loaded ? formatCellSummary(loaded, operation.includeBoc) : null;
    }
    case "endParse":
      slice.endParse();
      return { ended: true };
  }
};
var buildCellTree = (cell, currentDepth, maxDepth, includeBoc, visited) => {
  const hash = cell.hash().toString("hex");
  const summary = formatCellSummary(cell, includeBoc);
  const baseNode = {
    hash: summary.hash,
    bits: summary.bits,
    refsCount: summary.refs,
    isExotic: summary.isExotic,
    ...summary.boc ? { boc: summary.boc } : {}
  };
  if (currentDepth >= maxDepth || visited.has(hash)) {
    return {
      ...baseNode,
      children: cell.refs.map((ref) => ({
        hash: ref.hash().toString("hex")
      }))
    };
  }
  visited.add(hash);
  return {
    ...baseNode,
    children: cell.refs.map(
      (ref) => buildCellTree(ref, currentDepth + 1, maxDepth, includeBoc, visited)
    )
  };
};
var buildExternalMessageCell = (input) => {
  if (input.bodyBoc && input.bodyComment) {
    throw new Error("Provide either bodyBoc or bodyComment, not both.");
  }
  const to = parseAddress(input.to);
  const body = input.bodyBoc ? parseBocCell(input.bodyBoc).cell : input.bodyComment ? comment(input.bodyComment) : Cell2.EMPTY;
  const init = input.stateInitBoc ? loadStateInit2(parseBocCell(input.stateInitBoc).cell.beginParse()) : void 0;
  const message = external({
    to,
    init,
    body
  });
  const messageCell = beginCell().store(storeMessage(message)).endCell();
  return { messageCell, destination: to.toString() };
};
var keyPairToSerializable = (keyPair, includeSecretKey) => ({
  publicKeyHex: keyPair.publicKey.toString("hex"),
  publicKeyBase64: keyPair.publicKey.toString("base64"),
  ...includeSecretKey ? {
    secretKeyHex: keyPair.secretKey.toString("hex"),
    secretKeyBase64: keyPair.secretKey.toString("base64")
  } : {}
});
var createWriteTools = ({ client }) => ({
  tonBuildCellBoc: jsonSafeTool({
    description: "Build a TON cell BOC from declarative builder operations (bit/int/coins/address/ref/string/etc).",
    inputSchema: z19.object({
      operations: z19.array(buildOperationSchema).min(1),
      exotic: z19.boolean().default(false).describe("Mark resulting root cell as exotic.")
    }),
    execute: async ({ operations, exotic }) => {
      const builder = beginCell();
      for (const operation of operations) {
        applyBuildOperation(builder, operation);
      }
      const cell = builder.endCell({ exotic });
      return {
        boc: cell.toBoc().toString("base64"),
        hash: cell.hash().toString("hex"),
        bits: cell.bits.length,
        refs: cell.refs.length,
        isExotic: cell.isExotic,
        operationsApplied: operations.length
      };
    }
  }),
  tonSliceRunOperations: jsonSafeTool({
    description: "Execute parsing/manipulation operations on a slice from a root BOC and return parsed values and remaining slice.",
    inputSchema: z19.object({
      boc: bocSchema,
      operations: z19.array(sliceOperationSchema).min(1),
      strictEndParse: z19.boolean().default(false).describe("If true, require no unread bits/refs after operations."),
      includeRemainderBoc: z19.boolean().default(true).describe("Include remaining unread slice as BOC.")
    }),
    execute: async ({
      boc,
      operations,
      strictEndParse,
      includeRemainderBoc
    }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const slice = cell.beginParse();
      const results = operations.map((operation, index) => ({
        index,
        type: operation.type,
        name: operation.name ?? null,
        value: executeSliceOperation(slice, operation)
      }));
      if (strictEndParse) {
        slice.endParse();
      }
      return {
        cellCount,
        operationsApplied: operations.length,
        results,
        remainingBits: slice.remainingBits,
        remainingRefs: slice.remainingRefs,
        remainderBoc: includeRemainderBoc ? slice.asCell().toBoc().toString("base64") : void 0
      };
    }
  }),
  tonParseCellTree: jsonSafeTool({
    description: "Parse/inspect root cell and referenced cells from BOC as a bounded tree.",
    inputSchema: z19.object({
      boc: bocSchema,
      maxDepth: z19.number().int().min(0).max(16).default(4).describe("Maximum recursion depth."),
      includeBoc: z19.boolean().default(false).describe("Include BOC for each visited node.")
    }),
    execute: async ({ boc, maxDepth, includeBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const tree = buildCellTree(cell, 0, maxDepth, includeBoc, /* @__PURE__ */ new Set());
      return {
        cellCount,
        rootHash: cell.hash().toString("hex"),
        maxDepth,
        tree
      };
    }
  }),
  tonGenerateWalletMnemonic: jsonSafeTool({
    description: "Generate a new wallet mnemonic and key pair locally. This exposes sensitive secrets.",
    inputSchema: z19.object({
      wordsCount: z19.number().int().min(12).max(48).default(24).describe("Mnemonic word count."),
      password: z19.string().optional().describe("Optional mnemonic password."),
      includeSecretKey: z19.boolean().default(true).describe("Include secret key in output.")
    }),
    execute: async ({ wordsCount, password, includeSecretKey }) => {
      const mnemonic = await mnemonicNew(wordsCount, password ?? null);
      const keyPair = await mnemonicToWalletKey(mnemonic, password ?? null);
      return {
        mnemonic,
        mnemonicPhrase: mnemonic.join(" "),
        ...keyPairToSerializable(keyPair, includeSecretKey)
      };
    }
  }),
  tonMnemonicToWalletKeys: jsonSafeTool({
    description: "Derive wallet key pair from mnemonic locally. This can expose sensitive secrets.",
    inputSchema: z19.object({
      mnemonic: mnemonicInputSchema,
      password: z19.string().optional().describe("Optional mnemonic password."),
      includeSecretKey: z19.boolean().default(true).describe("Include secret key in output.")
    }),
    execute: async ({ mnemonic, password, includeSecretKey }) => {
      const words = normalizeMnemonic(mnemonic);
      const isValid = await mnemonicValidate(words, password ?? null);
      if (!isValid) {
        throw new Error("Invalid mnemonic phrase.");
      }
      const keyPair = await mnemonicToWalletKey(words, password ?? null);
      return {
        mnemonic: words,
        mnemonicPhrase: words.join(" "),
        ...keyPairToSerializable(keyPair, includeSecretKey)
      };
    }
  }),
  tonSignData: jsonSafeTool({
    description: "Sign arbitrary data with an Ed25519 secret key locally.",
    inputSchema: z19.object({
      data: z19.string().min(1).describe("Data to sign."),
      dataEncoding: dataEncodingSchema.default("utf8"),
      secretKey: z19.string().min(1).describe("Secret key bytes."),
      secretKeyEncoding: keyEncodingSchema.default("hex")
    }),
    execute: async ({ data, dataEncoding, secretKey, secretKeyEncoding }) => {
      const dataBytes = decodeBuffer(data, dataEncoding, "data");
      const secretKeyBytes = decodeKeyBuffer(
        secretKey,
        secretKeyEncoding,
        "secretKey"
      );
      const signature = sign(dataBytes, secretKeyBytes);
      return {
        signatureHex: signature.toString("hex"),
        signatureBase64: signature.toString("base64")
      };
    }
  }),
  tonVerifySignedData: jsonSafeTool({
    description: "Verify Ed25519 signature locally.",
    inputSchema: z19.object({
      data: z19.string().min(1).describe("Original data."),
      dataEncoding: dataEncodingSchema.default("utf8"),
      signature: z19.string().min(1).describe("Signature bytes."),
      signatureEncoding: keyEncodingSchema.default("hex"),
      publicKey: z19.string().min(1).describe("Public key bytes."),
      publicKeyEncoding: keyEncodingSchema.default("hex")
    }),
    execute: async ({
      data,
      dataEncoding,
      signature,
      signatureEncoding,
      publicKey,
      publicKeyEncoding
    }) => {
      const dataBytes = decodeBuffer(data, dataEncoding, "data");
      const signatureBytes = decodeKeyBuffer(
        signature,
        signatureEncoding,
        "signature"
      );
      const publicKeyBytes = decodeKeyBuffer(
        publicKey,
        publicKeyEncoding,
        "publicKey"
      );
      return {
        isValid: signVerify(dataBytes, signatureBytes, publicKeyBytes)
      };
    }
  }),
  tonSafeSignCellBoc: jsonSafeTool({
    description: "TON-safe-sign a cell BOC locally with secret key.",
    inputSchema: z19.object({
      boc: bocSchema,
      secretKey: z19.string().min(1).describe("Secret key bytes."),
      secretKeyEncoding: keyEncodingSchema.default("hex"),
      seed: z19.string().optional().describe("Optional safe-sign seed/magic string.")
    }),
    execute: async ({ boc, secretKey, secretKeyEncoding, seed }) => {
      const { cell } = parseBocCell(boc);
      const secretKeyBytes = decodeKeyBuffer(
        secretKey,
        secretKeyEncoding,
        "secretKey"
      );
      const signature = safeSign(cell, secretKeyBytes, seed);
      return {
        signatureHex: signature.toString("hex"),
        signatureBase64: signature.toString("base64")
      };
    }
  }),
  tonSafeVerifyCellBocSignature: jsonSafeTool({
    description: "Verify TON-safe-sign signature for a cell BOC locally.",
    inputSchema: z19.object({
      boc: bocSchema,
      signature: z19.string().min(1).describe("Signature bytes."),
      signatureEncoding: keyEncodingSchema.default("hex"),
      publicKey: z19.string().min(1).describe("Public key bytes."),
      publicKeyEncoding: keyEncodingSchema.default("hex"),
      seed: z19.string().optional().describe("Optional safe-sign seed/magic string.")
    }),
    execute: async ({
      boc,
      signature,
      signatureEncoding,
      publicKey,
      publicKeyEncoding,
      seed
    }) => {
      const { cell } = parseBocCell(boc);
      const signatureBytes = decodeKeyBuffer(
        signature,
        signatureEncoding,
        "signature"
      );
      const publicKeyBytes = decodeKeyBuffer(
        publicKey,
        publicKeyEncoding,
        "publicKey"
      );
      return {
        isValid: safeSignVerify(cell, signatureBytes, publicKeyBytes, seed)
      };
    }
  }),
  tonBuildExternalMessageBoc: jsonSafeTool({
    description: "Build an external message BOC locally (can be sent via TonAPI).",
    inputSchema: z19.object({
      to: addressSchema,
      bodyBoc: bocSchema.optional().describe("Optional message body BOC (base64)."),
      bodyComment: z19.string().optional().describe("Optional plain text body comment."),
      stateInitBoc: bocSchema.optional().describe("Optional state init BOC (base64, state init cell).")
    }),
    execute: async ({ to, bodyBoc, bodyComment, stateInitBoc }) => {
      const { messageCell, destination } = buildExternalMessageCell({
        to,
        bodyBoc,
        bodyComment,
        stateInitBoc
      });
      return {
        destination,
        boc: messageCell.toBoc().toString("base64"),
        hash: messageCell.hash().toString("hex")
      };
    }
  }),
  tonSendBlockchainMessage: jsonSafeTool({
    description: "Send a prepared external/internal message BOC via TonAPI.",
    inputSchema: z19.object({
      boc: bocSchema,
      meta: z19.record(z19.string(), z19.string()).optional().describe("Optional metadata map.")
    }),
    execute: async ({ boc, meta }) => client.blockchain.sendBlockchainMessage({
      boc: parseBocCell(boc).cell,
      meta
    })
  }),
  tonSendBlockchainMessageBatch: jsonSafeTool({
    description: "Send up to 5 prepared message BOCs in one batch via TonAPI.",
    inputSchema: z19.object({
      bocs: z19.array(bocSchema).min(1).max(5).describe("Array of message BOCs."),
      meta: z19.record(z19.string(), z19.string()).optional().describe("Optional metadata map.")
    }),
    execute: async ({ bocs, meta }) => client.blockchain.sendBlockchainMessage({
      batch: bocs.map((boc) => parseBocCell(boc).cell),
      meta
    })
  }),
  tonBuildAndSendExternalMessage: jsonSafeTool({
    description: "Build an external message BOC locally, then send it via TonAPI.",
    inputSchema: z19.object({
      to: addressSchema,
      bodyBoc: bocSchema.optional().describe("Optional message body BOC (base64)."),
      bodyComment: z19.string().optional().describe("Optional plain text body comment."),
      stateInitBoc: bocSchema.optional().describe("Optional state init BOC (base64, state init cell)."),
      meta: z19.record(z19.string(), z19.string()).optional().describe("Optional metadata map.")
    }),
    execute: async ({ to, bodyBoc, bodyComment, stateInitBoc, meta }) => {
      const { messageCell, destination } = buildExternalMessageCell({
        to,
        bodyBoc,
        bodyComment,
        stateInitBoc
      });
      const boc = messageCell.toBoc().toString("base64");
      const sendResult = await client.blockchain.sendBlockchainMessage({
        boc: messageCell,
        meta
      });
      return {
        destination,
        boc,
        hash: messageCell.hash().toString("hex"),
        sendResult
      };
    }
  })
});

// src/ton-tools.ts
var createToolsFromClient = (client) => ({
  ...createAccountTools({ client }),
  ...createJettonTools({ client }),
  ...createNftTools({ client }),
  ...createDnsTools({ client }),
  ...createRatesTools({ client }),
  ...createTonConnectTools({ client }),
  ...createWalletTools({ client }),
  ...createStakingTools({ client }),
  ...createStorageTools({ client }),
  ...createTraceTools({ client }),
  ...createEventTools({ client }),
  ...createInscriptionsTools({ client }),
  ...createEmulationTools({ client }),
  ...createExtraCurrencyTools({ client }),
  ...createMultisigTools({ client }),
  ...createBlockchainTools({ client }),
  ...createUtilityTools({ client }),
  ...createWriteTools({ client })
});
var createTonTools = (options = {}) => createToolsFromClient(createClient(options));
export {
  createTonTools
};
