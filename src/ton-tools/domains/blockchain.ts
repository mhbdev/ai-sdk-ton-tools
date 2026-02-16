import { z } from "zod";
import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress } from "../parsers";
import { addressSchema } from "../schemas";
import type { ToolOptions } from "../types";

export const createBlockchainTools = ({ client }: ToolOptions) => ({
  tonGetReducedBlockchainBlocks: jsonSafeTool({
    description: "Get reduced blockchain block data for a seqno range.",
    inputSchema: z.object({
      from: z
        .number()
        .int()
        .describe("Start masterchain seqno (inclusive)."),
      to: z.number().int().describe("End masterchain seqno (inclusive)."),
    }),
    execute: async ({ from, to }) =>
      client.blockchain.getReducedBlockchainBlocks({
        from,
        to,
      }),
  }),
  tonGetMasterchainHead: jsonSafeTool({
    description: "Get the latest known masterchain block.",
    inputSchema: z.object({}),
    execute: async () => client.blockchain.getBlockchainMasterchainHead(),
  }),
  tonGetMasterchainShards: jsonSafeTool({
    description: "Get shard blocks for a masterchain seqno.",
    inputSchema: z.object({
      masterchainSeqno: z.number().int().describe("Masterchain seqno."),
    }),
    execute: async ({ masterchainSeqno }) =>
      client.blockchain.getBlockchainMasterchainShards(masterchainSeqno),
  }),
  tonGetMasterchainBlocks: jsonSafeTool({
    description: "Get all blocks linked to a masterchain seqno snapshot.",
    inputSchema: z.object({
      masterchainSeqno: z.number().int().describe("Masterchain seqno."),
    }),
    execute: async ({ masterchainSeqno }) =>
      client.blockchain.getBlockchainMasterchainBlocks(masterchainSeqno),
  }),
  tonGetMasterchainTransactions: jsonSafeTool({
    description:
      "Get all transactions linked to a masterchain seqno snapshot.",
    inputSchema: z.object({
      masterchainSeqno: z.number().int().describe("Masterchain seqno."),
    }),
    execute: async ({ masterchainSeqno }) =>
      client.blockchain.getBlockchainMasterchainTransactions(masterchainSeqno),
  }),
  tonGetBlock: jsonSafeTool({
    description: "Get a blockchain block by block ID.",
    inputSchema: z.object({
      blockId: z
        .string()
        .min(1)
        .describe("Block ID string like (workchain,shard,seqno)."),
    }),
    execute: async ({ blockId }) =>
      client.blockchain.getBlockchainBlock(blockId),
  }),
  tonGetBlockTransactions: jsonSafeTool({
    description: "Get transactions from a blockchain block.",
    inputSchema: z.object({
      blockId: z
        .string()
        .min(1)
        .describe("Block ID string like (workchain,shard,seqno)."),
    }),
    execute: async ({ blockId }) =>
      client.blockchain.getBlockchainBlockTransactions(blockId),
  }),
  tonGetTransaction: jsonSafeTool({
    description: "Get a transaction by transaction ID.",
    inputSchema: z.object({
      transactionId: z.string().min(1).describe("Transaction hash string."),
    }),
    execute: async ({ transactionId }) =>
      client.blockchain.getBlockchainTransaction(transactionId),
  }),
  tonGetTransactionByMessageHash: jsonSafeTool({
    description: "Get a transaction by message hash.",
    inputSchema: z.object({
      messageHash: z.string().min(1).describe("Message hash string."),
    }),
    execute: async ({ messageHash }) =>
      client.blockchain.getBlockchainTransactionByMessageHash(messageHash),
  }),
  tonGetValidators: jsonSafeTool({
    description: "Get current blockchain validators.",
    inputSchema: z.object({}),
    execute: async () => client.blockchain.getBlockchainValidators(),
  }),
  tonGetBlockchainConfig: jsonSafeTool({
    description: "Get current blockchain config.",
    inputSchema: z.object({}),
    execute: async () => client.blockchain.getBlockchainConfig(),
  }),
  tonGetBlockchainConfigFromBlock: jsonSafeTool({
    description: "Get blockchain config at a specific masterchain seqno.",
    inputSchema: z.object({
      masterchainSeqno: z.number().int().describe("Masterchain seqno."),
    }),
    execute: async ({ masterchainSeqno }) =>
      client.blockchain.getBlockchainConfigFromBlock(masterchainSeqno),
  }),
  tonGetRawBlockchainConfig: jsonSafeTool({
    description: "Get raw blockchain config cells.",
    inputSchema: z.object({}),
    execute: async () => client.blockchain.getRawBlockchainConfig(),
  }),
  tonGetRawBlockchainConfigFromBlock: jsonSafeTool({
    description: "Get raw blockchain config from a specific masterchain seqno.",
    inputSchema: z.object({
      masterchainSeqno: z.number().int().describe("Masterchain seqno."),
    }),
    execute: async ({ masterchainSeqno }) =>
      client.blockchain.getRawBlockchainConfigFromBlock(masterchainSeqno),
  }),
  tonGetBlockchainRawAccount: jsonSafeTool({
    description: "Get low-level blockchain account state.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.blockchain.getBlockchainRawAccount(parseAddress(address)),
  }),
  tonInspectBlockchainAccount: jsonSafeTool({
    description: "Inspect derived account metadata from blockchain state.",
    inputSchema: z.object({
      address: addressSchema,
    }),
    execute: async ({ address }) =>
      client.blockchain.blockchainAccountInspect(parseAddress(address)),
  }),
  tonGetBlockchainStatus: jsonSafeTool({
    description: "Get TonAPI service status from blockchain namespace.",
    inputSchema: z.object({}),
    execute: async () => client.blockchain.status(),
  }),
  tonExecGetMethod: jsonSafeTool({
    description: "Execute a get method for a blockchain account.",
    inputSchema: z.object({
      address: addressSchema,
      methodName: z
        .string()
        .min(1)
        .describe("Get method name, e.g. get_wallet_data."),
      args: z
        .array(z.string())
        .optional()
        .describe(
          "Method arguments as strings (addresses, hex ints, or BOC values)."
        ),
      fixOrder: z
        .boolean()
        .optional()
        .describe("Use TonAPI argument order workaround if needed."),
    }),
    execute: async ({ address, methodName, args, fixOrder }) =>
      client.blockchain.execGetMethodForBlockchainAccount(
        parseAddress(address),
        methodName,
        {
          args,
          fix_order: fixOrder,
        }
      ),
  }),
});
