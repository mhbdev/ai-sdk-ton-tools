import {
  Cell,
  beginCell,
  comment,
  external,
  loadStateInit,
  safeSign,
  safeSignVerify,
  storeMessage,
} from "@ton/core";
import {
  mnemonicNew,
  mnemonicToWalletKey,
  mnemonicValidate,
  sign,
  signVerify,
} from "@ton/crypto";
import { z } from "zod";

import { formatCellSummary } from "../formatters";
import { jsonSafeTool } from "../json-safe-tool";
import { parseAddress, parseBocCell } from "../parsers";
import { addressSchema, bocSchema } from "../schemas";
import type { ToolOptions } from "../types";

const bigintLikeSchema = z
  .union([z.string().min(1), z.number().int()])
  .describe("Integer value as decimal string or integer number.");
const dataEncodingSchema = z
  .enum(["utf8", "hex", "base64"])
  .describe("Binary data encoding.");
const outputEncodingSchema = z
  .enum(["utf8", "hex", "base64"])
  .describe("Output encoding.");
const keyEncodingSchema = z
  .enum(["hex", "base64"])
  .describe("Key/signature encoding.");
const numberModeSchema = z
  .enum(["string", "number"])
  .describe("Return integer as string (safe) or JS number (safe-range only).");

const mnemonicInputSchema = z.union([
  z.string().min(1).describe("Mnemonic phrase string."),
  z.array(z.string().min(1)).min(12).describe("Mnemonic phrase word array."),
]);

const normalizeMnemonic = (input: string | string[]) => {
  if (Array.isArray(input)) {
    return input.map((word) => word.trim()).filter((word) => word.length > 0);
  }

  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
};

const decodeBuffer = (
  value: string,
  encoding: "utf8" | "hex" | "base64",
  label: string
) => {
  if (encoding === "hex") {
    if (value.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(value)) {
      throw new Error(`${label} must be valid even-length hex.`);
    }
  }

  return Buffer.from(value, encoding);
};

const decodeKeyBuffer = (
  value: string,
  encoding: "hex" | "base64",
  label: string
) => decodeBuffer(value, encoding, label);

const encodeBuffer = (
  value: Buffer,
  encoding: "utf8" | "hex" | "base64"
) => value.toString(encoding);

const parseBigIntLike = (value: string | number, label: string) => {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be a valid integer value.`);
  }
};

const toNumberModeValue = (
  value: bigint,
  mode: "string" | "number"
): string | number => {
  if (mode === "string") {
    return value.toString();
  }

  const asNumber = Number(value);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error("Value does not fit in JS safe integer range.");
  }

  return asNumber;
};

const buildOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bit"),
    value: z.union([z.boolean(), z.number().int()]).describe("Bit value."),
  }),
  z.object({
    type: z.literal("uint"),
    value: bigintLikeSchema,
    bits: z.number().int().min(1).max(256).describe("Bit width."),
  }),
  z.object({
    type: z.literal("int"),
    value: bigintLikeSchema,
    bits: z.number().int().min(1).max(257).describe("Bit width."),
  }),
  z.object({
    type: z.literal("varUint"),
    value: bigintLikeSchema,
    bits: z.number().int().min(1).max(16).describe("Header bit width."),
  }),
  z.object({
    type: z.literal("varInt"),
    value: bigintLikeSchema,
    bits: z.number().int().min(1).max(16).describe("Header bit width."),
  }),
  z.object({
    type: z.literal("coins"),
    value: bigintLikeSchema,
  }),
  z.object({
    type: z.literal("address"),
    value: addressSchema
      .nullable()
      .optional()
      .describe("Internal address or null for empty address."),
  }),
  z.object({
    type: z.literal("buffer"),
    value: z.string().describe("Buffer data."),
    encoding: dataEncodingSchema.default("utf8"),
    bytes: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Optional exact byte width."),
  }),
  z.object({
    type: z.literal("stringTail"),
    value: z.string().describe("Tail string."),
  }),
  z.object({
    type: z.literal("stringRefTail"),
    value: z.string().describe("Tail string in ref."),
  }),
  z.object({
    type: z.literal("bocRef"),
    boc: bocSchema.describe("Referenced cell BOC."),
  }),
  z.object({
    type: z.literal("bocSlice"),
    boc: bocSchema.describe("Slice source BOC."),
  }),
  z.object({
    type: z.literal("maybeRef"),
    boc: bocSchema.optional().describe("Ref cell BOC. Omit for null ref."),
  }),
]);

const sliceOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("skip"),
    bits: z.number().int().min(0).describe("Bits to skip."),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("remaining"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadBit"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadBoolean"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadUint"),
    bits: z.number().int().min(1).max(256),
    mode: numberModeSchema.default("string"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadInt"),
    bits: z.number().int().min(1).max(257),
    mode: numberModeSchema.default("string"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadVarUint"),
    bits: z.number().int().min(1).max(16),
    mode: numberModeSchema.default("string"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadVarInt"),
    bits: z.number().int().min(1).max(16),
    mode: numberModeSchema.default("string"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadCoins"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadAddress"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadMaybeAddress"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadAddressAny"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadBuffer"),
    bytes: z.number().int().min(1).describe("Bytes to load."),
    outputEncoding: outputEncodingSchema.default("hex"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadBits"),
    bits: z.number().int().min(1).describe("Bits to load."),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadStringTail"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadMaybeStringTail"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadStringRefTail"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadMaybeStringRefTail"),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadRef"),
    includeBoc: z.boolean().default(true),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("loadMaybeRef"),
    includeBoc: z.boolean().default(true),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal("endParse"),
    name: z.string().optional(),
  }),
]);

const applyBuildOperation = (
  target: ReturnType<typeof beginCell>,
  operation: z.infer<typeof buildOperationSchema>
) => {
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

const executeSliceOperation = (
  slice: ReturnType<Cell["beginParse"]>,
  operation: z.infer<typeof sliceOperationSchema>
) => {
  switch (operation.type) {
    case "skip":
      slice.skip(operation.bits);
      return { skippedBits: operation.bits };
    case "remaining":
      return {
        remainingBits: slice.remainingBits,
        remainingRefs: slice.remainingRefs,
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
      const byteAligned =
        bits.length % 8 === 0 ? bits.subbuffer(0, bits.length) : null;

      return {
        bits: bits.toString(),
        length: bits.length,
        byteAlignedHex: byteAligned?.toString("hex") ?? null,
        byteAlignedBase64: byteAligned?.toString("base64") ?? null,
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

export type CellTreeNode = {
  hash: string;
  bits: number;
  refsCount: number;
  isExotic: boolean;
  boc?: string;
  children: Array<CellTreeNode | { hash: string }>;
};

const buildCellTree = (
  cell: Cell,
  currentDepth: number,
  maxDepth: number,
  includeBoc: boolean,
  visited: Set<string>
): CellTreeNode => {
  const hash = cell.hash().toString("hex");
  const summary = formatCellSummary(cell, includeBoc);
  const baseNode: Omit<CellTreeNode, "children"> = {
    hash: summary.hash,
    bits: summary.bits,
    refsCount: summary.refs,
    isExotic: summary.isExotic,
    ...(summary.boc ? { boc: summary.boc } : {}),
  };

  if (currentDepth >= maxDepth || visited.has(hash)) {
    return {
      ...baseNode,
      children: cell.refs.map((ref) => ({
        hash: ref.hash().toString("hex"),
      })),
    };
  }

  visited.add(hash);
  return {
    ...baseNode,
    children: cell.refs.map((ref) =>
      buildCellTree(ref, currentDepth + 1, maxDepth, includeBoc, visited)
    ),
  };
};

const buildExternalMessageCell = (input: {
  to: string;
  bodyBoc?: string;
  bodyComment?: string;
  stateInitBoc?: string;
}) => {
  if (input.bodyBoc && input.bodyComment) {
    throw new Error("Provide either bodyBoc or bodyComment, not both.");
  }

  const to = parseAddress(input.to);
  const body = input.bodyBoc
    ? parseBocCell(input.bodyBoc).cell
    : input.bodyComment
      ? comment(input.bodyComment)
      : Cell.EMPTY;

  const init = input.stateInitBoc
    ? loadStateInit(parseBocCell(input.stateInitBoc).cell.beginParse())
    : undefined;

  const message = external({
    to,
    init,
    body,
  });

  const messageCell = beginCell().store(storeMessage(message)).endCell();
  return { messageCell, destination: to.toString() };
};

const keyPairToSerializable = (
  keyPair: { publicKey: Buffer; secretKey: Buffer },
  includeSecretKey: boolean
) => ({
  publicKeyHex: keyPair.publicKey.toString("hex"),
  publicKeyBase64: keyPair.publicKey.toString("base64"),
  ...(includeSecretKey
    ? {
        secretKeyHex: keyPair.secretKey.toString("hex"),
        secretKeyBase64: keyPair.secretKey.toString("base64"),
      }
    : {}),
});

export const createWriteTools = ({ client }: ToolOptions) => ({
  tonBuildCellBoc: jsonSafeTool({
    description:
      "Build a TON cell BOC from declarative builder operations (bit/int/coins/address/ref/string/etc).",
    inputSchema: z.object({
      operations: z.array(buildOperationSchema).min(1),
      exotic: z
        .boolean()
        .default(false)
        .describe("Mark resulting root cell as exotic."),
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
        operationsApplied: operations.length,
      };
    },
  }),
  tonSliceRunOperations: jsonSafeTool({
    description:
      "Execute parsing/manipulation operations on a slice from a root BOC and return parsed values and remaining slice.",
    inputSchema: z.object({
      boc: bocSchema,
      operations: z.array(sliceOperationSchema).min(1),
      strictEndParse: z
        .boolean()
        .default(false)
        .describe("If true, require no unread bits/refs after operations."),
      includeRemainderBoc: z
        .boolean()
        .default(true)
        .describe("Include remaining unread slice as BOC."),
    }),
    execute: async ({
      boc,
      operations,
      strictEndParse,
      includeRemainderBoc,
    }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const slice = cell.beginParse();

      const results = operations.map((operation, index) => ({
        index,
        type: operation.type,
        name: operation.name ?? null,
        value: executeSliceOperation(slice, operation),
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
        remainderBoc: includeRemainderBoc
          ? slice.asCell().toBoc().toString("base64")
          : undefined,
      };
    },
  }),
  tonParseCellTree: jsonSafeTool({
    description:
      "Parse/inspect root cell and referenced cells from BOC as a bounded tree.",
    inputSchema: z.object({
      boc: bocSchema,
      maxDepth: z
        .number()
        .int()
        .min(0)
        .max(16)
        .default(4)
        .describe("Maximum recursion depth."),
      includeBoc: z
        .boolean()
        .default(false)
        .describe("Include BOC for each visited node."),
    }),
    execute: async ({ boc, maxDepth, includeBoc }) => {
      const { cell, cellCount } = parseBocCell(boc);
      const tree = buildCellTree(cell, 0, maxDepth, includeBoc, new Set());

      return {
        cellCount,
        rootHash: cell.hash().toString("hex"),
        maxDepth,
        tree,
      };
    },
  }),
  tonGenerateWalletMnemonic: jsonSafeTool({
    description:
      "Generate a new wallet mnemonic and key pair locally. This exposes sensitive secrets.",
    inputSchema: z.object({
      wordsCount: z
        .number()
        .int()
        .min(12)
        .max(48)
        .default(24)
        .describe("Mnemonic word count."),
      password: z.string().optional().describe("Optional mnemonic password."),
      includeSecretKey: z
        .boolean()
        .default(true)
        .describe("Include secret key in output."),
    }),
    execute: async ({ wordsCount, password, includeSecretKey }) => {
      const mnemonic = await mnemonicNew(wordsCount, password ?? null);
      const keyPair = await mnemonicToWalletKey(mnemonic, password ?? null);

      return {
        mnemonic,
        mnemonicPhrase: mnemonic.join(" "),
        ...keyPairToSerializable(keyPair, includeSecretKey),
      };
    },
  }),
  tonMnemonicToWalletKeys: jsonSafeTool({
    description:
      "Derive wallet key pair from mnemonic locally. This can expose sensitive secrets.",
    inputSchema: z.object({
      mnemonic: mnemonicInputSchema,
      password: z.string().optional().describe("Optional mnemonic password."),
      includeSecretKey: z
        .boolean()
        .default(true)
        .describe("Include secret key in output."),
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
        ...keyPairToSerializable(keyPair, includeSecretKey),
      };
    },
  }),
  tonSignData: jsonSafeTool({
    description: "Sign arbitrary data with an Ed25519 secret key locally.",
    inputSchema: z.object({
      data: z.string().min(1).describe("Data to sign."),
      dataEncoding: dataEncodingSchema.default("utf8"),
      secretKey: z.string().min(1).describe("Secret key bytes."),
      secretKeyEncoding: keyEncodingSchema.default("hex"),
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
        signatureBase64: signature.toString("base64"),
      };
    },
  }),
  tonVerifySignedData: jsonSafeTool({
    description: "Verify Ed25519 signature locally.",
    inputSchema: z.object({
      data: z.string().min(1).describe("Original data."),
      dataEncoding: dataEncodingSchema.default("utf8"),
      signature: z.string().min(1).describe("Signature bytes."),
      signatureEncoding: keyEncodingSchema.default("hex"),
      publicKey: z.string().min(1).describe("Public key bytes."),
      publicKeyEncoding: keyEncodingSchema.default("hex"),
    }),
    execute: async ({
      data,
      dataEncoding,
      signature,
      signatureEncoding,
      publicKey,
      publicKeyEncoding,
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
        isValid: signVerify(dataBytes, signatureBytes, publicKeyBytes),
      };
    },
  }),
  tonSafeSignCellBoc: jsonSafeTool({
    description: "TON-safe-sign a cell BOC locally with secret key.",
    inputSchema: z.object({
      boc: bocSchema,
      secretKey: z.string().min(1).describe("Secret key bytes."),
      secretKeyEncoding: keyEncodingSchema.default("hex"),
      seed: z
        .string()
        .optional()
        .describe("Optional safe-sign seed/magic string."),
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
        signatureBase64: signature.toString("base64"),
      };
    },
  }),
  tonSafeVerifyCellBocSignature: jsonSafeTool({
    description: "Verify TON-safe-sign signature for a cell BOC locally.",
    inputSchema: z.object({
      boc: bocSchema,
      signature: z.string().min(1).describe("Signature bytes."),
      signatureEncoding: keyEncodingSchema.default("hex"),
      publicKey: z.string().min(1).describe("Public key bytes."),
      publicKeyEncoding: keyEncodingSchema.default("hex"),
      seed: z
        .string()
        .optional()
        .describe("Optional safe-sign seed/magic string."),
    }),
    execute: async ({
      boc,
      signature,
      signatureEncoding,
      publicKey,
      publicKeyEncoding,
      seed,
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
        isValid: safeSignVerify(cell, signatureBytes, publicKeyBytes, seed),
      };
    },
  }),
  tonBuildExternalMessageBoc: jsonSafeTool({
    description:
      "Build an external message BOC locally (can be sent via TonAPI).",
    inputSchema: z.object({
      to: addressSchema,
      bodyBoc: bocSchema
        .optional()
        .describe("Optional message body BOC (base64)."),
      bodyComment: z
        .string()
        .optional()
        .describe("Optional plain text body comment."),
      stateInitBoc: bocSchema
        .optional()
        .describe("Optional state init BOC (base64, state init cell)."),
    }),
    execute: async ({ to, bodyBoc, bodyComment, stateInitBoc }) => {
      const { messageCell, destination } = buildExternalMessageCell({
        to,
        bodyBoc,
        bodyComment,
        stateInitBoc,
      });

      return {
        destination,
        boc: messageCell.toBoc().toString("base64"),
        hash: messageCell.hash().toString("hex"),
      };
    },
  }),
  tonSendBlockchainMessage: jsonSafeTool({
    description: "Send a prepared external/internal message BOC via TonAPI.",
    inputSchema: z.object({
      boc: bocSchema,
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional metadata map."),
    }),
    execute: async ({ boc, meta }) =>
      client.blockchain.sendBlockchainMessage({
        boc: parseBocCell(boc).cell,
        meta,
      }),
  }),
  tonSendBlockchainMessageBatch: jsonSafeTool({
    description:
      "Send up to 5 prepared message BOCs in one batch via TonAPI.",
    inputSchema: z.object({
      bocs: z
        .array(bocSchema)
        .min(1)
        .max(5)
        .describe("Array of message BOCs."),
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional metadata map."),
    }),
    execute: async ({ bocs, meta }) =>
      client.blockchain.sendBlockchainMessage({
        batch: bocs.map((boc) => parseBocCell(boc).cell),
        meta,
      }),
  }),
  tonBuildAndSendExternalMessage: jsonSafeTool({
    description:
      "Build an external message BOC locally, then send it via TonAPI.",
    inputSchema: z.object({
      to: addressSchema,
      bodyBoc: bocSchema
        .optional()
        .describe("Optional message body BOC (base64)."),
      bodyComment: z
        .string()
        .optional()
        .describe("Optional plain text body comment."),
      stateInitBoc: bocSchema
        .optional()
        .describe("Optional state init BOC (base64, state init cell)."),
      meta: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional metadata map."),
    }),
    execute: async ({ to, bodyBoc, bodyComment, stateInitBoc, meta }) => {
      const { messageCell, destination } = buildExternalMessageCell({
        to,
        bodyBoc,
        bodyComment,
        stateInitBoc,
      });

      const boc = messageCell.toBoc().toString("base64");
      const sendResult = await client.blockchain.sendBlockchainMessage({
        boc: messageCell,
        meta,
      });

      return {
        destination,
        boc,
        hash: messageCell.hash().toString("hex"),
        sendResult,
      };
    },
  }),
});
