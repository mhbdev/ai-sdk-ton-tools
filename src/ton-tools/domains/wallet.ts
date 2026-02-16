import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { addressSchema, publicKeySchema, stateInitSchema } from "../schemas";
import type { ToolOptions } from "../types";
import { parseAddress, parseStateInit } from "../parsers";

export const createWalletTools = ({ client }: ToolOptions) => ({
  tonTonConnectProof: jsonSafeTool({
    description: "Verify TonConnect proof and issue auth token via TonAPI.",
    inputSchema: z.object({
      address: addressSchema,
      proof: z.object({
        timestamp: z.number().int().describe("Unix timestamp."),
        domain: z.object({
          lengthBytes: z.number().int().optional(),
          value: z.string().min(1),
        }),
        signature: z.string().min(1),
        payload: z.string().min(1),
        stateInit: stateInitSchema.optional(),
      }),
    }),
    execute: async ({ address, proof }) =>
      client.wallet.tonConnectProof({
        address: parseAddress(address),
        proof: {
          timestamp: proof.timestamp,
          domain: {
            lengthBytes: proof.domain.lengthBytes,
            value: proof.domain.value,
          },
          signature: proof.signature,
          payload: proof.payload,
          stateInit: proof.stateInit
            ? parseStateInit(proof.stateInit)
            : undefined,
        },
      }),
  }),
  tonGetAccountSeqno: jsonSafeTool({
    description: "Get wallet seqno for an account.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.wallet.getAccountSeqno(parseAddress(address)),
  }),
  tonGetWalletsByPublicKey: jsonSafeTool({
    description: "Get wallet accounts by public key.",
    inputSchema: z.object({
      publicKey: publicKeySchema,
    }),
    execute: async ({ publicKey }) =>
      client.wallet.getWalletsByPublicKey(publicKey),
  }),
});
