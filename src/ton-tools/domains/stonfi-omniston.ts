import {
  Blockchain,
  GaslessSettlement,
  Omniston,
  SettlementMethod,
  type Address as OmnistonAddress,
  type BuildTransferRequest,
  type BuildWithdrawalRequest,
  type Observable,
  type QuoteRequest,
  type QuoteResponseEvent,
  type TrackTradeRequest,
  type TradeStatus,
} from "@ston-fi/omniston-sdk";
import { z } from "zod";

import { jsonSafeTool } from "../json-safe-tool";
import { addressSchema } from "../schemas";
import type { StonfiRuntime, ToolOptions } from "../types";
import {
  normalizeTonAddress,
  serializeStonfiValue,
  toAmountValue,
} from "./stonfi-shared";

const omnistonAddressObjectSchema = z.object({
  blockchain: z.number().int(),
  address: z.string().min(1),
});

const omnistonAddressInputSchema = z.union([
  addressSchema.describe(
    "TON address shorthand. Will be converted into Omniston address with TON blockchain code."
  ),
  omnistonAddressObjectSchema.describe("Omniston address object."),
]);

const settlementMethodSchema = z.enum([
  SettlementMethod.SETTLEMENT_METHOD_SWAP,
  SettlementMethod.SETTLEMENT_METHOD_ESCROW,
  SettlementMethod.SETTLEMENT_METHOD_HTLC,
]);

const gaslessSettlementSchema = z.enum([
  GaslessSettlement.GASLESS_SETTLEMENT_PROHIBITED,
  GaslessSettlement.GASLESS_SETTLEMENT_POSSIBLE,
  GaslessSettlement.GASLESS_SETTLEMENT_REQUIRED,
]);

const quoteAmountSchema = z
  .object({
    bidUnits: z
      .union([z.string().min(1), z.number().int()])
      .optional()
      .describe("Input amount in bid asset units."),
    askUnits: z
      .union([z.string().min(1), z.number().int()])
      .optional()
      .describe("Target amount in ask asset units."),
  })
  .refine((value) => value.bidUnits !== undefined || value.askUnits !== undefined, {
    message: "Provide at least one of bidUnits or askUnits.",
  });

const requestSettlementParamsSchema = z.object({
  maxPriceSlippageBps: z.number().int().positive().optional(),
  maxOutgoingMessages: z.number().int().positive().optional(),
  gaslessSettlement: gaslessSettlementSchema,
  flexibleReferrerFee: z.boolean().optional(),
});

const quoteRequestInputSchema = z.object({
  bidAssetAddress: omnistonAddressInputSchema.optional(),
  askAssetAddress: omnistonAddressInputSchema.optional(),
  amount: quoteAmountSchema,
  settlementMethods: z.array(settlementMethodSchema).min(1),
  referrerAddress: omnistonAddressInputSchema.optional(),
  referrerFeeBps: z.number().int().min(0).max(10_000).optional(),
  settlementParams: requestSettlementParamsSchema.optional(),
});

const timeoutMsSchema = z
  .number()
  .int()
  .min(250)
  .max(120_000)
  .default(12_000)
  .describe("Maximum snapshot collection duration in milliseconds.");

const maxEventsSchema = z
  .number()
  .int()
  .min(1)
  .max(500)
  .default(24)
  .describe("Maximum number of events to capture from stream.");

const normalizeOmnistonAddress = (
  value: z.infer<typeof omnistonAddressInputSchema>,
  label: string
): OmnistonAddress => {
  if (typeof value === "string") {
    return {
      blockchain: Blockchain.TON,
      address: normalizeTonAddress(value, label),
    };
  }

  const address = value.address.trim();
  if (address.length === 0) {
    throw new Error(`${label}.address must not be empty.`);
  }

  if (value.blockchain === Blockchain.TON) {
    return {
      blockchain: value.blockchain,
      address: normalizeTonAddress(address, `${label}.address`),
    };
  }

  return {
    blockchain: value.blockchain,
    address,
  };
};

const normalizeOptionalOmnistonAddress = (
  value: z.infer<typeof omnistonAddressInputSchema> | undefined,
  label: string
) => (value ? normalizeOmnistonAddress(value, label) : undefined);

const normalizeQuoteRequest = (
  request: z.infer<typeof quoteRequestInputSchema>
): QuoteRequest => {
  const normalizedAmount = {
    bidUnits:
      request.amount.bidUnits === undefined
        ? undefined
        : toAmountValue(request.amount.bidUnits, "request.amount.bidUnits"),
    askUnits:
      request.amount.askUnits === undefined
        ? undefined
        : toAmountValue(request.amount.askUnits, "request.amount.askUnits"),
  };

  return {
    amount: normalizedAmount,
    settlementMethods: request.settlementMethods,
    bidAssetAddress: normalizeOptionalOmnistonAddress(
      request.bidAssetAddress,
      "request.bidAssetAddress"
    ),
    askAssetAddress: normalizeOptionalOmnistonAddress(
      request.askAssetAddress,
      "request.askAssetAddress"
    ),
    referrerAddress: normalizeOptionalOmnistonAddress(
      request.referrerAddress,
      "request.referrerAddress"
    ),
    referrerFeeBps: request.referrerFeeBps,
    settlementParams: request.settlementParams
      ? {
          maxPriceSlippageBps: request.settlementParams.maxPriceSlippageBps,
          maxOutgoingMessages: request.settlementParams.maxOutgoingMessages,
          gaslessSettlement: request.settlementParams.gaslessSettlement,
          flexibleReferrerFee: request.settlementParams.flexibleReferrerFee,
        }
      : undefined,
  };
};

const normalizeTransferQuoteInput = (quote: unknown) => {
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) {
    throw new Error(
      "request.quote must be a quote object from tonStonfiOmnistonRequestQuotes."
    );
  }

  const normalized = { ...(quote as Record<string, unknown>) };
  if ("bidAssetAddress" in normalized && normalized.bidAssetAddress) {
    normalized.bidAssetAddress = normalizeOmnistonAddress(
      normalized.bidAssetAddress as z.infer<typeof omnistonAddressInputSchema>,
      "request.quote.bidAssetAddress"
    );
  }
  if ("askAssetAddress" in normalized && normalized.askAssetAddress) {
    normalized.askAssetAddress = normalizeOmnistonAddress(
      normalized.askAssetAddress as z.infer<typeof omnistonAddressInputSchema>,
      "request.quote.askAssetAddress"
    );
  }
  if ("referrerAddress" in normalized && normalized.referrerAddress) {
    normalized.referrerAddress = normalizeOmnistonAddress(
      normalized.referrerAddress as z.infer<typeof omnistonAddressInputSchema>,
      "request.quote.referrerAddress"
    );
  }

  return normalized as unknown as BuildTransferRequest["quote"];
};

const resolveOmnistonApiUrlOrThrow = (stonfi: StonfiRuntime): string => {
  const apiUrl = stonfi.getOmnistonApiUrl();
  let parsed: URL;

  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(
      `STON.fi Omniston API URL is invalid: "${apiUrl}". Set TonToolsOptions.stonfiOmnistonApiUrl or STONFI_OMNISTON_API_URL to a valid ws/wss URL.`
    );
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(
      `STON.fi Omniston API URL must use ws:// or wss://, received "${parsed.protocol}".`
    );
  }

  return parsed.toString();
};

const withOmniston = async <T>(
  stonfi: StonfiRuntime,
  callback: (omniston: Omniston, apiUrl: string) => Promise<T>
) => {
  const apiUrl = resolveOmnistonApiUrlOrThrow(stonfi);
  const omniston = new Omniston({ apiUrl });

  try {
    return await callback(omniston, apiUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /connection|connect|websocket|socket|closed|close|ECONN|ENOTFOUND|timed out|timeout/i.test(
        message
      )
    ) {
      throw new Error(`Unable to reach STON.fi Omniston at ${apiUrl}: ${message}`);
    }

    throw error;
  } finally {
    omniston.close();
  }
};

type SnapshotReason = "timeout" | "maxEvents" | "completed" | "error";

const collectObservableSnapshot = <T>(
  stream: Observable<T>,
  timeoutMs: number,
  maxEvents: number
) =>
  new Promise<{
    events: T[];
    reason: SnapshotReason;
    didComplete: boolean;
    error: unknown;
  }>((resolve) => {
    const events: T[] = [];
    let settled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    const settle = (
      reason: SnapshotReason,
      didComplete: boolean,
      error?: unknown
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription?.unsubscribe();
      resolve({
        events,
        reason,
        didComplete,
        error: error ? serializeStonfiValue(error) : null,
      });
    };

    const timeout = setTimeout(() => {
      settle("timeout", false);
    }, timeoutMs);

    subscription = stream.subscribe({
      next: (value) => {
        events.push(value);
        if (events.length >= maxEvents) {
          settle("maxEvents", false);
        }
      },
      error: (error) => {
        settle("error", false, error);
      },
      complete: () => {
        settle("completed", true);
      },
    });
  });

const compareQuotesByRate = (
  left: { askUnits: string; bidUnits: string },
  right: { askUnits: string; bidUnits: string }
) => {
  try {
    const leftScaled = BigInt(left.askUnits) * BigInt(right.bidUnits);
    const rightScaled = BigInt(right.askUnits) * BigInt(left.bidUnits);

    if (leftScaled > rightScaled) return 1;
    if (leftScaled < rightScaled) return -1;
  } catch {
    const askCompare = left.askUnits.localeCompare(right.askUnits, undefined, {
      numeric: true,
    });
    if (askCompare !== 0) return askCompare;

    const bidCompare = right.bidUnits.localeCompare(left.bidUnits, undefined, {
      numeric: true,
    });
    if (bidCompare !== 0) return bidCompare;
  }

  return 0;
};

const getTradeStatusStage = (status: TradeStatus): string => {
  const oneOf = status.status;
  if (!oneOf) return "unknown";

  if (oneOf.awaitingTransfer) return "awaitingTransfer";
  if (oneOf.transferring) return "transferring";
  if (oneOf.swapping) return "swapping";
  if (oneOf.awaitingFill) return "awaitingFill";
  if (oneOf.claimAvailable) return "claimAvailable";
  if (oneOf.refundAvailable) return "refundAvailable";
  if (oneOf.receivingFunds) return "receivingFunds";
  if (oneOf.tradeSettled) return "tradeSettled";
  if (oneOf.keepAlive) return "keepAlive";
  if (oneOf.unsubscribed) return "unsubscribed";

  return "unknown";
};

const isTerminalTradeStage = (stage: string) =>
  stage === "tradeSettled" || stage === "unsubscribed";

export const createStonfiOmnistonTools = ({ stonfi }: ToolOptions) => ({
  tonStonfiOmnistonRequestQuotes: jsonSafeTool({
    description:
      "Request Omniston quotes and return a bounded snapshot of quote stream events.",
    inputSchema: z.object({
      request: quoteRequestInputSchema,
      timeoutMs: timeoutMsSchema,
      maxEvents: maxEventsSchema,
    }),
    execute: async ({ request, timeoutMs, maxEvents }) =>
      withOmniston(stonfi, async (omniston, apiUrl) => {
        const normalizedRequest = normalizeQuoteRequest(request);
        const snapshot = await collectObservableSnapshot(
          omniston.requestForQuote(normalizedRequest),
          timeoutMs,
          maxEvents
        );

        const quoteUpdatedEvents = snapshot.events.filter(
          (event): event is Extract<QuoteResponseEvent, { type: "quoteUpdated" }> =>
            event.type === "quoteUpdated"
        );
        const latestQuoteEvent =
          quoteUpdatedEvents.length === 0
            ? null
            : quoteUpdatedEvents[quoteUpdatedEvents.length - 1];
        const bestQuoteEvent =
          quoteUpdatedEvents.length === 0
            ? null
            : quoteUpdatedEvents.reduce((best, current) =>
                compareQuotesByRate(current.quote, best.quote) > 0 ? current : best
              );
        const latestEvent =
          snapshot.events.length === 0
            ? null
            : snapshot.events[snapshot.events.length - 1];

        return serializeStonfiValue({
          apiUrl,
          request: normalizedRequest,
          snapshot: {
            timeoutMs,
            maxEvents,
            reason: snapshot.reason,
            didComplete: snapshot.didComplete,
            eventCount: snapshot.events.length,
            error: snapshot.error,
          },
          latestQuote: latestQuoteEvent?.quote ?? null,
          bestQuote: bestQuoteEvent?.quote ?? null,
          latestEvent,
          events: snapshot.events,
        });
      }),
  }),
  tonStonfiOmnistonBuildTransfer: jsonSafeTool({
    description:
      "Build an unsigned Omniston transfer transaction payload from a selected quote.",
    inputSchema: z.object({
      request: z.object({
        sourceAddress: omnistonAddressInputSchema,
        destinationAddress: omnistonAddressInputSchema,
        gasExcessAddress: omnistonAddressInputSchema.optional(),
        refundAddress: omnistonAddressInputSchema.optional(),
        quote: z
          .unknown()
          .describe("Quote object, usually from tonStonfiOmnistonRequestQuotes."),
        useRecommendedSlippage: z.boolean().default(false),
      }),
    }),
    execute: async ({ request }) =>
      withOmniston(stonfi, async (omniston, apiUrl) => {
        const buildRequest: BuildTransferRequest = {
          sourceAddress: normalizeOmnistonAddress(
            request.sourceAddress,
            "request.sourceAddress"
          ),
          destinationAddress: normalizeOmnistonAddress(
            request.destinationAddress,
            "request.destinationAddress"
          ),
          gasExcessAddress: normalizeOptionalOmnistonAddress(
            request.gasExcessAddress,
            "request.gasExcessAddress"
          ),
          refundAddress: normalizeOptionalOmnistonAddress(
            request.refundAddress,
            "request.refundAddress"
          ),
          quote: normalizeTransferQuoteInput(request.quote),
          useRecommendedSlippage: request.useRecommendedSlippage,
        };

        const transaction = await omniston.buildTransfer(buildRequest);

        return serializeStonfiValue({
          apiUrl,
          request: buildRequest,
          transaction,
        });
      }),
  }),
  tonStonfiOmnistonBuildWithdrawal: jsonSafeTool({
    description: "Build an unsigned Omniston withdrawal transaction payload.",
    inputSchema: z.object({
      request: z.object({
        sourceAddress: omnistonAddressInputSchema,
        quoteId: z.string().min(1),
        gasExcessAddress: omnistonAddressInputSchema.optional(),
      }),
    }),
    execute: async ({ request }) =>
      withOmniston(stonfi, async (omniston, apiUrl) => {
        const buildRequest: BuildWithdrawalRequest = {
          sourceAddress: normalizeOmnistonAddress(
            request.sourceAddress,
            "request.sourceAddress"
          ),
          quoteId: request.quoteId,
          gasExcessAddress: normalizeOptionalOmnistonAddress(
            request.gasExcessAddress,
            "request.gasExcessAddress"
          ),
        };

        const transaction = await omniston.buildWithdrawal(buildRequest);
        return serializeStonfiValue({
          apiUrl,
          request: buildRequest,
          transaction,
        });
      }),
  }),
  tonStonfiOmnistonTrackTrade: jsonSafeTool({
    description:
      "Track Omniston trade status stream and return a bounded snapshot of statuses.",
    inputSchema: z.object({
      request: z.object({
        quoteId: z.string().min(1),
        traderWalletAddress: omnistonAddressInputSchema,
        outgoingTxHash: z.string().min(1),
      }),
      timeoutMs: timeoutMsSchema,
      maxEvents: maxEventsSchema,
    }),
    execute: async ({ request, timeoutMs, maxEvents }) =>
      withOmniston(stonfi, async (omniston, apiUrl) => {
        const normalizedRequest: TrackTradeRequest = {
          quoteId: request.quoteId,
          traderWalletAddress: normalizeOmnistonAddress(
            request.traderWalletAddress,
            "request.traderWalletAddress"
          ),
          outgoingTxHash: request.outgoingTxHash,
        };

        const snapshot = await collectObservableSnapshot(
          omniston.trackTrade(normalizedRequest),
          timeoutMs,
          maxEvents
        );

        const statusEvents = snapshot.events.map((status) => ({
          stage: getTradeStatusStage(status),
          status,
        }));

        const latest =
          statusEvents.length === 0
            ? null
            : statusEvents[statusEvents.length - 1];
        const terminal =
          statusEvents.length === 0
            ? null
            : [...statusEvents]
                .reverse()
                .find((event) => isTerminalTradeStage(event.stage)) ?? null;

        return serializeStonfiValue({
          apiUrl,
          request: normalizedRequest,
          snapshot: {
            timeoutMs,
            maxEvents,
            reason: snapshot.reason,
            didComplete: snapshot.didComplete,
            eventCount: snapshot.events.length,
            error: snapshot.error,
          },
          latestStatus: latest,
          terminalStatus: terminal,
          events: statusEvents,
        });
      }),
  }),
  tonStonfiOmnistonEscrowList: jsonSafeTool({
    description: "List Omniston escrow orders for a trader wallet.",
    inputSchema: z.object({
      request: z.object({
        traderWalletAddress: omnistonAddressInputSchema,
      }),
    }),
    execute: async ({ request }) =>
      withOmniston(stonfi, async (omniston, apiUrl) => {
        const listRequest = {
          traderWalletAddress: normalizeOmnistonAddress(
            request.traderWalletAddress,
            "request.traderWalletAddress"
          ),
        };

        const escrowOrders = await omniston.escrowList(listRequest);
        return serializeStonfiValue({
          apiUrl,
          request: listRequest,
          escrowOrders,
        });
      }),
  }),
});
