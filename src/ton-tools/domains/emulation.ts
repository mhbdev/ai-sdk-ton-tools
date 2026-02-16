import {
  contractAddress,
  loadMessage,
  loadMessageRelaxed,
  loadStateInit,
  loadTransaction,
} from "@ton/core";
import { z } from "zod";
import {
  formatAddress,
  formatMessage,
  formatMessageRelaxed,
  formatStateInit,
  formatTransaction,
} from "../formatters";
import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress, parseBocCell, parseLt } from "../parsers";
import { addressSchema, bocSchema, ltSchema } from "../schemas";
import type { ToolOptions } from "../types";

export const createEmulationTools = ({ client }: ToolOptions) => ({
  tonDecodeMessageBoc: jsonSafeTool({
    description: "Decode a TON message BOC locally.",
    inputSchema: z.object({
      boc: bocSchema,
      relaxed: z
        .boolean()
        .optional()
        .describe("Decode as relaxed message (MessageRelaxed)."),
      includeBodyBoc: z
        .boolean()
        .optional()
        .describe("Include base64 body BOC in response."),
      includeInitBoc: z
        .boolean()
        .optional()
        .describe("Include base64 init code/data in response."),
    }),
    execute: async ({ boc, relaxed, includeBodyBoc, includeInitBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);

      if (relaxed) {
        const message = loadMessageRelaxed(cell.beginParse());
        return {
          cellCount,
          message: formatMessageRelaxed(message, {
            includeBodyBoc,
            includeInitBoc,
          }),
        };
      }

      const message = loadMessage(cell.beginParse());
      return {
        cellCount,
        message: formatMessage(message, { includeBodyBoc, includeInitBoc }),
      };
    },
  }),
  tonDecodeTransactionBoc: jsonSafeTool({
    description: "Decode a TON transaction BOC locally.",
    inputSchema: z.object({
      boc: bocSchema,
      includeMessages: z
        .boolean()
        .optional()
        .describe("Include decoded in/out messages in response."),
      includeBodyBoc: z
        .boolean()
        .optional()
        .describe("Include base64 body BOC in message summaries."),
      includeInitBoc: z
        .boolean()
        .optional()
        .describe("Include base64 init code/data in message summaries."),
    }),
    execute: async ({
      boc,
      includeMessages,
      includeBodyBoc,
      includeInitBoc,
    }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const transaction = loadTransaction(cell.beginParse());

      return {
        cellCount,
        transaction: formatTransaction(transaction, {
          includeMessages,
          includeBodyBoc,
          includeInitBoc,
        }),
      };
    },
  }),
  tonDecodeStateInitBoc: jsonSafeTool({
    description: "Decode a state init BOC locally.",
    inputSchema: z.object({
      boc: bocSchema,
      workchain: z
        .number()
        .int()
        .optional()
        .describe("Workchain ID to compute contract address."),
      includeCodeBoc: z
        .boolean()
        .optional()
        .describe("Include base64 code BOC in response."),
      includeDataBoc: z
        .boolean()
        .optional()
        .describe("Include base64 data BOC in response."),
    }),
    execute: async ({ boc, workchain, includeCodeBoc, includeDataBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const init = loadStateInit(cell.beginParse());

      const address =
        workchain === undefined ? null : contractAddress(workchain, init);

      return {
        cellCount,
        address: address ? formatAddress(address) : null,
        stateInit: formatStateInit(init, {
          includeCodeBoc,
          includeDataBoc,
        }),
      };
    },
  }),
  tonComputeAddressFromStateInit: jsonSafeTool({
    description: "Compute contract address from a state init BOC locally.",
    inputSchema: z.object({
      boc: bocSchema,
      workchain: z
        .number()
        .int()
        .default(0)
        .describe("Workchain ID (default 0)."),
    }),
    execute: async ({ boc, workchain }) => {
      const { cell } = parseBocCell(boc);
      const init = loadStateInit(cell.beginParse());
      return {
        address: formatAddress(contractAddress(workchain, init)),
      };
    },
  }),
  tonDecodeMessageApi: jsonSafeTool({
    description: "Decode a message BOC via TonAPI emulation endpoint.",
    inputSchema: z.object({
      boc: bocSchema,
    }),
    execute: async ({ boc }) =>
      client.emulation.decodeMessage({
        boc: parseBocCell(boc).cell,
      }),
  }),
  tonEmulateMessageToEvent: jsonSafeTool({
    description: "Emulate sending a message and return resulting event.",
    inputSchema: z.object({
      boc: bocSchema,
      ignoreSignatureCheck: z
        .boolean()
        .optional()
        .describe("Ignore message signature check during emulation."),
    }),
    execute: async ({ boc, ignoreSignatureCheck }) =>
      client.emulation.emulateMessageToEvent(
        {
          boc: parseBocCell(boc).cell,
        },
        {
          ignore_signature_check: ignoreSignatureCheck,
        }
      ),
  }),
  tonEmulateMessageToTrace: jsonSafeTool({
    description: "Emulate sending a message and return resulting trace.",
    inputSchema: z.object({
      boc: bocSchema,
      ignoreSignatureCheck: z
        .boolean()
        .optional()
        .describe("Ignore message signature check during emulation."),
    }),
    execute: async ({ boc, ignoreSignatureCheck }) =>
      client.emulation.emulateMessageToTrace(
        {
          boc: parseBocCell(boc).cell,
        },
        {
          ignore_signature_check: ignoreSignatureCheck,
        }
      ),
  }),
  tonEmulateMessageToWallet: jsonSafeTool({
    description: "Emulate message execution with optional per-account settings.",
    inputSchema: z.object({
      boc: bocSchema,
      params: z
        .array(
          z.object({
            address: addressSchema,
            balance: ltSchema
              .optional()
              .describe("Optional account balance override."),
          })
        )
        .optional()
        .describe("Optional account configuration for emulation."),
    }),
    execute: async ({ boc, params }) =>
      client.emulation.emulateMessageToWallet({
        boc: parseBocCell(boc).cell,
        params: params?.map((param) => ({
          address: parseAddress(param.address),
          balance: parseLt(param.balance),
        })),
      }),
  }),
  tonEmulateMessageToAccountEvent: jsonSafeTool({
    description: "Emulate a message against a specific account and return event.",
    inputSchema: z.object({
      address: addressSchema,
      boc: bocSchema,
      ignoreSignatureCheck: z
        .boolean()
        .optional()
        .describe("Ignore message signature check during emulation."),
    }),
    execute: async ({ address, boc, ignoreSignatureCheck }) =>
      client.emulation.emulateMessageToAccountEvent(
        parseAddress(address),
        {
          boc: parseBocCell(boc).cell,
        },
        {
          ignore_signature_check: ignoreSignatureCheck,
        }
      ),
  }),
});
