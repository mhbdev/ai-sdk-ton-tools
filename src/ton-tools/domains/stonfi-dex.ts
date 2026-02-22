import { z } from "zod";

import { jsonSafeTool } from "../json-safe-tool";
import { addressSchema, bocSchema } from "../schemas";
import type { ToolOptions } from "../types";
import {
  amountLikeSchema,
  createLpAccount,
  createPoolForDexType,
  createPton,
  createRouterForDexType,
  createVault,
  getProviderForContract,
  getRpcTonClient,
  normalizeOptionalTonAddress,
  normalizeTonAddress,
  parseOptionalBocCell,
  queryIdLikeSchema,
  serializeStonfiValue,
  stonfiDexTypeSchema,
  summarizeCell,
  toAmountValue,
  toAmountValueOptional,
  toQueryIdValue,
} from "./stonfi-shared";

const optionalAddressSchema = addressSchema.optional();
const optionalBocSchema = bocSchema.optional();
const optionalAmountSchema = amountLikeSchema.optional();
const optionalQueryIdSchema = queryIdLikeSchema.optional();
const optionalDeadlineSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Optional unix timestamp deadline.");

const routerSwapBodyParamsSchema = z.object({
  askJettonWalletAddress: addressSchema,
  receiverAddress: addressSchema,
  minAskAmount: amountLikeSchema,
  refundAddress: addressSchema,
  excessesAddress: optionalAddressSchema,
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  refundPayload: optionalBocSchema,
  refundForwardGasAmount: optionalAmountSchema,
  referralAddress: optionalAddressSchema,
  referralValue: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
});

const routerProvideLiquidityBodyParamsSchema = z.object({
  routerWalletAddress: addressSchema,
  minLpOut: amountLikeSchema,
  receiverAddress: addressSchema,
  refundAddress: addressSchema,
  excessesAddress: optionalAddressSchema,
  bothPositive: z.boolean(),
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
});

const routerBodyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createSwapBody"),
    params: routerSwapBodyParamsSchema,
  }),
  z.object({
    action: z.literal("createCrossSwapBody"),
    params: routerSwapBodyParamsSchema,
  }),
  z.object({
    action: z.literal("createProvideLiquidityBody"),
    params: routerProvideLiquidityBodyParamsSchema,
  }),
]);

const routerSwapJettonToJettonTxParamsSchema = z.object({
  userWalletAddress: addressSchema,
  receiverAddress: optionalAddressSchema,
  offerJettonAddress: addressSchema,
  offerJettonWalletAddress: optionalAddressSchema,
  askJettonAddress: addressSchema,
  askJettonWalletAddress: optionalAddressSchema,
  offerAmount: amountLikeSchema,
  minAskAmount: amountLikeSchema,
  refundAddress: optionalAddressSchema,
  excessesAddress: optionalAddressSchema,
  referralAddress: optionalAddressSchema,
  referralValue: optionalAmountSchema,
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  refundPayload: optionalBocSchema,
  refundForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
  gasAmount: optionalAmountSchema,
  forwardGasAmount: optionalAmountSchema,
  queryId: optionalQueryIdSchema,
  jettonCustomPayload: optionalBocSchema,
  transferExcessAddress: optionalAddressSchema,
});

const routerSwapJettonToTonTxParamsSchema = z.object({
  userWalletAddress: addressSchema,
  receiverAddress: optionalAddressSchema,
  offerJettonAddress: addressSchema,
  offerJettonWalletAddress: optionalAddressSchema,
  proxyTonAddress: addressSchema,
  askJettonWalletAddress: optionalAddressSchema,
  offerAmount: amountLikeSchema,
  minAskAmount: amountLikeSchema,
  refundAddress: optionalAddressSchema,
  excessesAddress: optionalAddressSchema,
  referralAddress: optionalAddressSchema,
  referralValue: optionalAmountSchema,
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  refundPayload: optionalBocSchema,
  refundForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
  gasAmount: optionalAmountSchema,
  forwardGasAmount: optionalAmountSchema,
  queryId: optionalQueryIdSchema,
  jettonCustomPayload: optionalBocSchema,
  transferExcessAddress: optionalAddressSchema,
});

const routerSwapTonToJettonTxParamsSchema = z.object({
  userWalletAddress: addressSchema,
  receiverAddress: optionalAddressSchema,
  proxyTonAddress: addressSchema,
  offerJettonWalletAddress: optionalAddressSchema,
  askJettonAddress: addressSchema,
  askJettonWalletAddress: optionalAddressSchema,
  offerAmount: amountLikeSchema,
  minAskAmount: amountLikeSchema,
  refundAddress: optionalAddressSchema,
  excessesAddress: optionalAddressSchema,
  referralAddress: optionalAddressSchema,
  referralValue: optionalAmountSchema,
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  refundPayload: optionalBocSchema,
  refundForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
  forwardGasAmount: optionalAmountSchema,
  queryId: optionalQueryIdSchema,
});

const routerProvideLiquidityJettonTxParamsSchema = z.object({
  userWalletAddress: addressSchema,
  receiverAddress: optionalAddressSchema,
  sendTokenAddress: addressSchema,
  otherTokenAddress: addressSchema,
  sendAmount: amountLikeSchema,
  minLpOut: amountLikeSchema,
  refundAddress: optionalAddressSchema,
  excessesAddress: optionalAddressSchema,
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
  gasAmount: optionalAmountSchema,
  forwardGasAmount: optionalAmountSchema,
  queryId: optionalQueryIdSchema,
  jettonCustomPayload: optionalBocSchema,
  transferExcessAddress: optionalAddressSchema,
});

const routerProvideLiquidityTonTxParamsSchema = z.object({
  userWalletAddress: addressSchema,
  receiverAddress: optionalAddressSchema,
  proxyTonAddress: addressSchema,
  otherTokenAddress: addressSchema,
  sendAmount: amountLikeSchema,
  minLpOut: amountLikeSchema,
  refundAddress: optionalAddressSchema,
  excessesAddress: optionalAddressSchema,
  bothPositive: z.boolean().optional(),
  dexCustomPayload: optionalBocSchema,
  dexCustomPayloadForwardGasAmount: optionalAmountSchema,
  deadline: optionalDeadlineSchema,
  forwardGasAmount: optionalAmountSchema,
  queryId: optionalQueryIdSchema,
});

const routerTxActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("getSwapJettonToJettonTxParams"),
    params: routerSwapJettonToJettonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getSwapJettonToTonTxParams"),
    params: routerSwapJettonToTonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getSwapTonToJettonTxParams"),
    params: routerSwapTonToJettonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getProvideLiquidityJettonTxParams"),
    params: routerProvideLiquidityJettonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getSingleSideProvideLiquidityJettonTxParams"),
    params: routerProvideLiquidityJettonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getProvideLiquidityTonTxParams"),
    params: routerProvideLiquidityTonTxParamsSchema,
  }),
  z.object({
    action: z.literal("getSingleSideProvideLiquidityTonTxParams"),
    params: routerProvideLiquidityTonTxParamsSchema,
  }),
]);

const poolBodyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createCollectFeesBody"),
    params: z
      .object({
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
  z.object({
    action: z.literal("createBurnBody"),
    params: z.object({
      amount: amountLikeSchema,
      dexCustomPayload: optionalBocSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
]);

const poolTxActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("getCollectFeeTxParams"),
    params: z
      .object({
        gasAmount: optionalAmountSchema,
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
  z.object({
    action: z.literal("getBurnTxParams"),
    params: z.object({
      amount: amountLikeSchema,
      userWalletAddress: addressSchema,
      dexCustomPayload: optionalBocSchema,
      gasAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
]);

const lpAccountBodyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createRefundBody"),
    params: z
      .object({
        leftMaybePayload: optionalBocSchema,
        rightMaybePayload: optionalBocSchema,
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
  z.object({
    action: z.literal("createDirectAddLiquidityBody"),
    params: z.object({
      userWalletAddress: addressSchema,
      amount0: amountLikeSchema,
      amount1: amountLikeSchema,
      minimumLpToMint: optionalAmountSchema,
      refundAddress: optionalAddressSchema,
      excessesAddress: optionalAddressSchema,
      dexCustomPayload: optionalBocSchema,
      dexCustomPayloadForwardGasAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
  z.object({
    action: z.literal("createResetGasBody"),
    params: z
      .object({
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
]);

const lpAccountTxActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("getRefundTxParams"),
    params: z
      .object({
        leftMaybePayload: optionalBocSchema,
        rightMaybePayload: optionalBocSchema,
        gasAmount: optionalAmountSchema,
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
  z.object({
    action: z.literal("getDirectAddLiquidityTxParams"),
    params: z.object({
      userWalletAddress: addressSchema,
      amount0: amountLikeSchema,
      amount1: amountLikeSchema,
      minimumLpToMint: optionalAmountSchema,
      refundAddress: optionalAddressSchema,
      excessesAddress: optionalAddressSchema,
      dexCustomPayload: optionalBocSchema,
      dexCustomPayloadForwardGasAmount: optionalAmountSchema,
      gasAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
  z.object({
    action: z.literal("getResetGasTxParams"),
    params: z
      .object({
        gasAmount: optionalAmountSchema,
        queryId: optionalQueryIdSchema,
      })
      .default({}),
  }),
]);

const vaultBodyActionSchema = z.object({
  action: z.literal("createWithdrawFeeBody"),
  params: z
    .object({
      queryId: optionalQueryIdSchema,
    })
    .default({}),
});

const vaultTxActionSchema = z.object({
  action: z.literal("getWithdrawFeeTxParams"),
  params: z
    .object({
      gasAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    })
    .default({}),
});

const ptonBodyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createTonTransferBody"),
    params: z.object({
      tonAmount: amountLikeSchema,
      refundAddress: addressSchema,
      forwardPayload: optionalBocSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
  z.object({
    action: z.literal("createDeployWalletBody"),
    params: z.object({
      ownerAddress: addressSchema,
      excessAddress: addressSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
]);

const ptonTxActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("getTonTransferTxParams"),
    params: z.object({
      tonAmount: amountLikeSchema,
      destinationAddress: addressSchema,
      destinationWalletAddress: optionalAddressSchema,
      refundAddress: addressSchema,
      forwardPayload: optionalBocSchema,
      forwardTonAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
  z.object({
    action: z.literal("getDeployWalletTxParams"),
    params: z.object({
      ownerAddress: addressSchema,
      excessAddress: addressSchema,
      gasAmount: optionalAmountSchema,
      queryId: optionalQueryIdSchema,
    }),
  }),
]);

const requireAddressPair = (
  first: string | undefined,
  second: string | undefined,
  pairName: string
) => {
  const hasFirst = Boolean(first);
  const hasSecond = Boolean(second);

  if (hasFirst !== hasSecond) {
    throw new Error(`${pairName} requires both addresses to be provided.`);
  }
};

const toSerializedTxParams = (txParams: unknown) => serializeStonfiValue(txParams);

const normalizeRouterSwapBodyParams = (
  params: z.infer<typeof routerSwapBodyParamsSchema>
) => ({
  askJettonWalletAddress: normalizeTonAddress(
    params.askJettonWalletAddress,
    "params.askJettonWalletAddress"
  ),
  receiverAddress: normalizeTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  minAskAmount: toAmountValue(params.minAskAmount, "params.minAskAmount"),
  refundAddress: normalizeTonAddress(params.refundAddress, "params.refundAddress"),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  refundPayload: parseOptionalBocCell(params.refundPayload, "params.refundPayload"),
  refundForwardGasAmount: toAmountValueOptional(
    params.refundForwardGasAmount,
    "params.refundForwardGasAmount"
  ),
  referralAddress: normalizeOptionalTonAddress(
    params.referralAddress,
    "params.referralAddress"
  ),
  referralValue: toAmountValueOptional(params.referralValue, "params.referralValue"),
  deadline: params.deadline,
});

const normalizeRouterProvideLiquidityBodyParams = (
  params: z.infer<typeof routerProvideLiquidityBodyParamsSchema>
) => ({
  routerWalletAddress: normalizeTonAddress(
    params.routerWalletAddress,
    "params.routerWalletAddress"
  ),
  minLpOut: toAmountValue(params.minLpOut, "params.minLpOut"),
  receiverAddress: normalizeTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  refundAddress: normalizeTonAddress(params.refundAddress, "params.refundAddress"),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  bothPositive: params.bothPositive,
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  deadline: params.deadline,
});

const normalizeRouterSwapJettonToJettonTxParams = (
  params: z.infer<typeof routerSwapJettonToJettonTxParamsSchema>
) => ({
  userWalletAddress: normalizeTonAddress(
    params.userWalletAddress,
    "params.userWalletAddress"
  ),
  receiverAddress: normalizeOptionalTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  offerJettonAddress: normalizeTonAddress(
    params.offerJettonAddress,
    "params.offerJettonAddress"
  ),
  offerJettonWalletAddress: normalizeOptionalTonAddress(
    params.offerJettonWalletAddress,
    "params.offerJettonWalletAddress"
  ),
  askJettonAddress: normalizeTonAddress(
    params.askJettonAddress,
    "params.askJettonAddress"
  ),
  askJettonWalletAddress: normalizeOptionalTonAddress(
    params.askJettonWalletAddress,
    "params.askJettonWalletAddress"
  ),
  offerAmount: toAmountValue(params.offerAmount, "params.offerAmount"),
  minAskAmount: toAmountValue(params.minAskAmount, "params.minAskAmount"),
  refundAddress: normalizeOptionalTonAddress(
    params.refundAddress,
    "params.refundAddress"
  ),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  referralAddress: normalizeOptionalTonAddress(
    params.referralAddress,
    "params.referralAddress"
  ),
  referralValue: toAmountValueOptional(params.referralValue, "params.referralValue"),
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  refundPayload: parseOptionalBocCell(params.refundPayload, "params.refundPayload"),
  refundForwardGasAmount: toAmountValueOptional(
    params.refundForwardGasAmount,
    "params.refundForwardGasAmount"
  ),
  deadline: params.deadline,
  gasAmount: toAmountValueOptional(params.gasAmount, "params.gasAmount"),
  forwardGasAmount: toAmountValueOptional(
    params.forwardGasAmount,
    "params.forwardGasAmount"
  ),
  queryId: toQueryIdValue(params.queryId, "params.queryId"),
  jettonCustomPayload: parseOptionalBocCell(
    params.jettonCustomPayload,
    "params.jettonCustomPayload"
  ),
  transferExcessAddress: normalizeOptionalTonAddress(
    params.transferExcessAddress,
    "params.transferExcessAddress"
  ),
});

const normalizeRouterSwapJettonToTonTxParams = (
  params: z.infer<typeof routerSwapJettonToTonTxParamsSchema>
) => ({
  userWalletAddress: normalizeTonAddress(
    params.userWalletAddress,
    "params.userWalletAddress"
  ),
  receiverAddress: normalizeOptionalTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  offerJettonAddress: normalizeTonAddress(
    params.offerJettonAddress,
    "params.offerJettonAddress"
  ),
  offerJettonWalletAddress: normalizeOptionalTonAddress(
    params.offerJettonWalletAddress,
    "params.offerJettonWalletAddress"
  ),
  proxyTon: createPton(params.proxyTonAddress),
  askJettonWalletAddress: normalizeOptionalTonAddress(
    params.askJettonWalletAddress,
    "params.askJettonWalletAddress"
  ),
  offerAmount: toAmountValue(params.offerAmount, "params.offerAmount"),
  minAskAmount: toAmountValue(params.minAskAmount, "params.minAskAmount"),
  refundAddress: normalizeOptionalTonAddress(
    params.refundAddress,
    "params.refundAddress"
  ),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  referralAddress: normalizeOptionalTonAddress(
    params.referralAddress,
    "params.referralAddress"
  ),
  referralValue: toAmountValueOptional(params.referralValue, "params.referralValue"),
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  refundPayload: parseOptionalBocCell(params.refundPayload, "params.refundPayload"),
  refundForwardGasAmount: toAmountValueOptional(
    params.refundForwardGasAmount,
    "params.refundForwardGasAmount"
  ),
  deadline: params.deadline,
  gasAmount: toAmountValueOptional(params.gasAmount, "params.gasAmount"),
  forwardGasAmount: toAmountValueOptional(
    params.forwardGasAmount,
    "params.forwardGasAmount"
  ),
  queryId: toQueryIdValue(params.queryId, "params.queryId"),
  jettonCustomPayload: parseOptionalBocCell(
    params.jettonCustomPayload,
    "params.jettonCustomPayload"
  ),
  transferExcessAddress: normalizeOptionalTonAddress(
    params.transferExcessAddress,
    "params.transferExcessAddress"
  ),
});

const normalizeRouterSwapTonToJettonTxParams = (
  params: z.infer<typeof routerSwapTonToJettonTxParamsSchema>
) => ({
  userWalletAddress: normalizeTonAddress(
    params.userWalletAddress,
    "params.userWalletAddress"
  ),
  receiverAddress: normalizeOptionalTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  proxyTon: createPton(params.proxyTonAddress),
  offerJettonWalletAddress: normalizeOptionalTonAddress(
    params.offerJettonWalletAddress,
    "params.offerJettonWalletAddress"
  ),
  askJettonAddress: normalizeTonAddress(
    params.askJettonAddress,
    "params.askJettonAddress"
  ),
  askJettonWalletAddress: normalizeOptionalTonAddress(
    params.askJettonWalletAddress,
    "params.askJettonWalletAddress"
  ),
  offerAmount: toAmountValue(params.offerAmount, "params.offerAmount"),
  minAskAmount: toAmountValue(params.minAskAmount, "params.minAskAmount"),
  refundAddress: normalizeOptionalTonAddress(
    params.refundAddress,
    "params.refundAddress"
  ),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  referralAddress: normalizeOptionalTonAddress(
    params.referralAddress,
    "params.referralAddress"
  ),
  referralValue: toAmountValueOptional(params.referralValue, "params.referralValue"),
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  refundPayload: parseOptionalBocCell(params.refundPayload, "params.refundPayload"),
  refundForwardGasAmount: toAmountValueOptional(
    params.refundForwardGasAmount,
    "params.refundForwardGasAmount"
  ),
  deadline: params.deadline,
  forwardGasAmount: toAmountValueOptional(
    params.forwardGasAmount,
    "params.forwardGasAmount"
  ),
  queryId: toQueryIdValue(params.queryId, "params.queryId"),
});

const normalizeRouterProvideLiquidityJettonTxParams = (
  params: z.infer<typeof routerProvideLiquidityJettonTxParamsSchema>
) => ({
  userWalletAddress: normalizeTonAddress(
    params.userWalletAddress,
    "params.userWalletAddress"
  ),
  receiverAddress: normalizeOptionalTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  sendTokenAddress: normalizeTonAddress(
    params.sendTokenAddress,
    "params.sendTokenAddress"
  ),
  otherTokenAddress: normalizeTonAddress(
    params.otherTokenAddress,
    "params.otherTokenAddress"
  ),
  sendAmount: toAmountValue(params.sendAmount, "params.sendAmount"),
  minLpOut: toAmountValue(params.minLpOut, "params.minLpOut"),
  refundAddress: normalizeOptionalTonAddress(
    params.refundAddress,
    "params.refundAddress"
  ),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  deadline: params.deadline,
  gasAmount: toAmountValueOptional(params.gasAmount, "params.gasAmount"),
  forwardGasAmount: toAmountValueOptional(
    params.forwardGasAmount,
    "params.forwardGasAmount"
  ),
  queryId: toQueryIdValue(params.queryId, "params.queryId"),
  jettonCustomPayload: parseOptionalBocCell(
    params.jettonCustomPayload,
    "params.jettonCustomPayload"
  ),
  transferExcessAddress: normalizeOptionalTonAddress(
    params.transferExcessAddress,
    "params.transferExcessAddress"
  ),
});

const normalizeRouterProvideLiquidityTonTxParams = (
  params: z.infer<typeof routerProvideLiquidityTonTxParamsSchema>
) => ({
  userWalletAddress: normalizeTonAddress(
    params.userWalletAddress,
    "params.userWalletAddress"
  ),
  receiverAddress: normalizeOptionalTonAddress(
    params.receiverAddress,
    "params.receiverAddress"
  ),
  proxyTon: createPton(params.proxyTonAddress),
  otherTokenAddress: normalizeTonAddress(
    params.otherTokenAddress,
    "params.otherTokenAddress"
  ),
  sendAmount: toAmountValue(params.sendAmount, "params.sendAmount"),
  minLpOut: toAmountValue(params.minLpOut, "params.minLpOut"),
  refundAddress: normalizeOptionalTonAddress(
    params.refundAddress,
    "params.refundAddress"
  ),
  excessesAddress: normalizeOptionalTonAddress(
    params.excessesAddress,
    "params.excessesAddress"
  ),
  bothPositive: params.bothPositive,
  dexCustomPayload: parseOptionalBocCell(
    params.dexCustomPayload,
    "params.dexCustomPayload"
  ),
  dexCustomPayloadForwardGasAmount: toAmountValueOptional(
    params.dexCustomPayloadForwardGasAmount,
    "params.dexCustomPayloadForwardGasAmount"
  ),
  deadline: params.deadline,
  forwardGasAmount: toAmountValueOptional(
    params.forwardGasAmount,
    "params.forwardGasAmount"
  ),
  queryId: toQueryIdValue(params.queryId, "params.queryId"),
});

const normalizePoolBurnBodyParams = (
  params: z.infer<typeof poolBodyActionSchema>["params"]
) => {
  if (!("amount" in params)) {
    return params;
  }

  return {
    amount: toAmountValue(params.amount, "params.amount"),
    dexCustomPayload: parseOptionalBocCell(
      params.dexCustomPayload,
      "params.dexCustomPayload"
    ),
    queryId: toQueryIdValue(params.queryId, "params.queryId"),
  };
};

export const createStonfiDexTools = ({ stonfi }: ToolOptions) => ({
  tonStonfiDexGetRouterData: jsonSafeTool({
    description:
      "Get STON.fi router version and state data for a v2_2 DEX router.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      routerAddress: addressSchema,
    }),
    execute: async ({ dexType, routerAddress }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedRouterAddress = normalizeTonAddress(
        routerAddress,
        "routerAddress"
      );
      const router = createRouterForDexType(dexType, normalizedRouterAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedRouterAddress,
        "routerAddress"
      );

      const [routerVersion, routerData] = await Promise.all([
        router.getRouterVersion(provider),
        router.getRouterData(provider),
      ]);

      return serializeStonfiValue({
        dexVersion: "v2_2",
        dexType,
        routerAddress: normalizedRouterAddress,
        routerVersion,
        routerData,
      });
    },
  }),
  tonStonfiDexResolveAddresses: jsonSafeTool({
    description:
      "Resolve pool/vault addresses and optional contracts via STON.fi v2_2 router.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      routerAddress: addressSchema,
      token0Address: optionalAddressSchema,
      token1Address: optionalAddressSchema,
      userAddress: optionalAddressSchema,
      tokenWalletAddress: optionalAddressSchema,
      tokenMinterAddress: optionalAddressSchema,
      includePoolData: z
        .boolean()
        .default(false)
        .describe("Also fetch pool data when resolving pool contract."),
      includeVaultData: z
        .boolean()
        .default(false)
        .describe("Also fetch vault data when resolving vault contract."),
    }),
    execute: async ({
      dexType,
      routerAddress,
      token0Address,
      token1Address,
      userAddress,
      tokenWalletAddress,
      tokenMinterAddress,
      includePoolData,
      includeVaultData,
    }) => {
      requireAddressPair(token0Address, token1Address, "Pool resolution");

      if (includePoolData && (!token0Address || !token1Address)) {
        throw new Error(
          "includePoolData requires token0Address and token1Address."
        );
      }

      if (includeVaultData && (!userAddress || !tokenMinterAddress)) {
        throw new Error(
          "includeVaultData requires userAddress and tokenMinterAddress."
        );
      }

      const tonClient = getRpcTonClient(stonfi);
      const normalizedRouterAddress = normalizeTonAddress(
        routerAddress,
        "routerAddress"
      );
      const router = createRouterForDexType(dexType, normalizedRouterAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedRouterAddress,
        "routerAddress"
      );

      const result: Record<string, unknown> = {
        dexVersion: "v2_2",
        dexType,
        routerAddress: normalizedRouterAddress,
      };

      if (token0Address && token1Address) {
        const normalizedToken0 = normalizeTonAddress(token0Address, "token0Address");
        const normalizedToken1 = normalizeTonAddress(token1Address, "token1Address");

        const poolAddress = await router.getPoolAddress(provider, {
          token0: normalizedToken0,
          token1: normalizedToken1,
        });
        const poolAddressByJettonMinters = await router.getPoolAddressByJettonMinters(
          provider,
          {
            token0: normalizedToken0,
            token1: normalizedToken1,
          }
        );
        const poolContract = await router.getPool(provider, {
          token0: normalizedToken0,
          token1: normalizedToken1,
        });

        result.token0Address = normalizedToken0;
        result.token1Address = normalizedToken1;
        result.poolAddress = poolAddress.toString();
        result.poolAddressByJettonMinters = poolAddressByJettonMinters.toString();
        result.poolContractAddress = poolContract.address.toString();

        if (includePoolData) {
          const poolProvider = getProviderForContract(
            tonClient,
            poolContract.address.toString(),
            "poolAddress"
          );
          result.poolData = await poolContract.getPoolData(poolProvider);
        }
      }

      if (userAddress && tokenWalletAddress) {
        const normalizedUser = normalizeTonAddress(userAddress, "userAddress");
        const normalizedTokenWallet = normalizeTonAddress(
          tokenWalletAddress,
          "tokenWalletAddress"
        );

        const vaultAddress = await router.getVaultAddress(provider, {
          user: normalizedUser,
          tokenWallet: normalizedTokenWallet,
        });

        result.userAddress = normalizedUser;
        result.tokenWalletAddress = normalizedTokenWallet;
        result.vaultAddress = vaultAddress.toString();
      }

      if (userAddress && tokenMinterAddress) {
        const normalizedUser = normalizeTonAddress(userAddress, "userAddress");
        const normalizedTokenMinter = normalizeTonAddress(
          tokenMinterAddress,
          "tokenMinterAddress"
        );

        const vault = await router.getVault(provider, {
          user: normalizedUser,
          tokenMinter: normalizedTokenMinter,
        });

        result.userAddress = normalizedUser;
        result.tokenMinterAddress = normalizedTokenMinter;
        result.vaultContractAddress = vault.address.toString();

        if (includeVaultData) {
          const vaultProvider = getProviderForContract(
            tonClient,
            vault.address.toString(),
            "vaultAddress"
          );
          result.vaultData = await vault.getVaultData(vaultProvider);
        }
      }

      return serializeStonfiValue(result);
    },
  }),
  tonStonfiDexGetPoolData: jsonSafeTool({
    description:
      "Get STON.fi pool type/data and optionally resolve LP account and jetton wallet data.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      poolAddress: addressSchema,
      ownerAddress: optionalAddressSchema,
      includeLpAccountData: z
        .boolean()
        .default(false)
        .describe("When ownerAddress is provided, also fetch LP account data."),
      jettonWalletOwnerAddress: optionalAddressSchema,
      includeJettonWalletData: z
        .boolean()
        .default(false)
        .describe(
          "When jettonWalletOwnerAddress is provided, also fetch jetton wallet data and balance."
        ),
    }),
    execute: async ({
      dexType,
      poolAddress,
      ownerAddress,
      includeLpAccountData,
      jettonWalletOwnerAddress,
      includeJettonWalletData,
    }) => {
      if (includeLpAccountData && !ownerAddress) {
        throw new Error("includeLpAccountData requires ownerAddress.");
      }

      if (includeJettonWalletData && !jettonWalletOwnerAddress) {
        throw new Error(
          "includeJettonWalletData requires jettonWalletOwnerAddress."
        );
      }

      const tonClient = getRpcTonClient(stonfi);
      const normalizedPoolAddress = normalizeTonAddress(poolAddress, "poolAddress");
      const pool = createPoolForDexType(dexType, normalizedPoolAddress);
      const poolProvider = getProviderForContract(
        tonClient,
        normalizedPoolAddress,
        "poolAddress"
      );

      const [poolType, poolData] = await Promise.all([
        pool.getPoolType(poolProvider),
        pool.getPoolData(poolProvider),
      ]);

      const result: Record<string, unknown> = {
        dexVersion: "v2_2",
        dexType,
        poolAddress: normalizedPoolAddress,
        poolType,
        poolData,
      };

      if (ownerAddress) {
        const normalizedOwnerAddress = normalizeTonAddress(ownerAddress, "ownerAddress");
        const lpAccountAddress = await pool.getLpAccountAddress(poolProvider, {
          ownerAddress: normalizedOwnerAddress,
        });
        const lpAccount = await pool.getLpAccount(poolProvider, {
          ownerAddress: normalizedOwnerAddress,
        });

        result.ownerAddress = normalizedOwnerAddress;
        result.lpAccountAddress = lpAccountAddress.toString();
        result.lpAccountContractAddress = lpAccount.address.toString();

        if (includeLpAccountData) {
          const lpProvider = getProviderForContract(
            tonClient,
            lpAccount.address.toString(),
            "lpAccountAddress"
          );
          result.lpAccountData = await lpAccount.getLpAccountData(lpProvider);
        }
      }

      if (jettonWalletOwnerAddress) {
        const normalizedJettonWalletOwner = normalizeTonAddress(
          jettonWalletOwnerAddress,
          "jettonWalletOwnerAddress"
        );
        const jettonWallet = await pool.getJettonWallet(poolProvider, {
          ownerAddress: normalizedJettonWalletOwner,
        });

        result.jettonWalletOwnerAddress = normalizedJettonWalletOwner;
        result.jettonWalletAddress = jettonWallet.address.toString();

        if (includeJettonWalletData) {
          const jettonWalletProvider = getProviderForContract(
            tonClient,
            jettonWallet.address.toString(),
            "jettonWalletAddress"
          );

          const [jettonWalletData, jettonWalletBalance] = await Promise.all([
            jettonWallet.getWalletData(jettonWalletProvider),
            jettonWallet.getBalance(jettonWalletProvider),
          ]);

          result.jettonWalletData = jettonWalletData;
          result.jettonWalletBalance = jettonWalletBalance;
        }
      }

      return serializeStonfiValue(result);
    },
  }),
  tonStonfiDexGetLpAccountData: jsonSafeTool({
    description: "Get STON.fi LP account state data.",
    inputSchema: z.object({
      lpAccountAddress: addressSchema,
    }),
    execute: async ({ lpAccountAddress }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedLpAddress = normalizeTonAddress(
        lpAccountAddress,
        "lpAccountAddress"
      );
      const lpAccount = createLpAccount(normalizedLpAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedLpAddress,
        "lpAccountAddress"
      );

      const lpAccountData = await lpAccount.getLpAccountData(provider);
      return serializeStonfiValue({
        dexVersion: "v2_2",
        lpAccountAddress: normalizedLpAddress,
        lpAccountData,
      });
    },
  }),
  tonStonfiDexGetVaultData: jsonSafeTool({
    description: "Get STON.fi vault state data.",
    inputSchema: z.object({
      vaultAddress: addressSchema,
    }),
    execute: async ({ vaultAddress }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedVaultAddress = normalizeTonAddress(
        vaultAddress,
        "vaultAddress"
      );
      const vault = createVault(normalizedVaultAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedVaultAddress,
        "vaultAddress"
      );

      const vaultData = await vault.getVaultData(provider);
      return serializeStonfiValue({
        dexVersion: "v2_2",
        vaultAddress: normalizedVaultAddress,
        vaultData,
      });
    },
  }),
  tonStonfiDexBuildRouterBody: jsonSafeTool({
    description:
      "Build STON.fi v2_2 router payload bodies (swap, cross-swap, provide-liquidity).",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      routerAddress: addressSchema,
      request: routerBodyActionSchema,
    }),
    execute: async ({ dexType, routerAddress, request }) => {
      getRpcTonClient(stonfi);
      const normalizedRouterAddress = normalizeTonAddress(
        routerAddress,
        "routerAddress"
      );
      const router = createRouterForDexType(dexType, normalizedRouterAddress);

      switch (request.action) {
        case "createSwapBody": {
          const body = await router.createSwapBody(
            normalizeRouterSwapBodyParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createCrossSwapBody": {
          const body = await router.createCrossSwapBody(
            normalizeRouterSwapBodyParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createProvideLiquidityBody": {
          const body = await router.createProvideLiquidityBody(
            normalizeRouterProvideLiquidityBodyParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildRouterTx: jsonSafeTool({
    description: "Build unsigned STON.fi v2_2 router transactions.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      routerAddress: addressSchema,
      request: routerTxActionSchema,
    }),
    execute: async ({ dexType, routerAddress, request }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedRouterAddress = normalizeTonAddress(
        routerAddress,
        "routerAddress"
      );
      const router = createRouterForDexType(dexType, normalizedRouterAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedRouterAddress,
        "routerAddress"
      );

      switch (request.action) {
        case "getSwapJettonToJettonTxParams": {
          const txParams = await router.getSwapJettonToJettonTxParams(
            provider,
            normalizeRouterSwapJettonToJettonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getSwapJettonToTonTxParams": {
          const txParams = await router.getSwapJettonToTonTxParams(
            provider,
            normalizeRouterSwapJettonToTonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getSwapTonToJettonTxParams": {
          const txParams = await router.getSwapTonToJettonTxParams(
            provider,
            normalizeRouterSwapTonToJettonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getProvideLiquidityJettonTxParams": {
          const txParams = await router.getProvideLiquidityJettonTxParams(
            provider,
            normalizeRouterProvideLiquidityJettonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getSingleSideProvideLiquidityJettonTxParams": {
          const txParams = await router.getSingleSideProvideLiquidityJettonTxParams(
            provider,
            normalizeRouterProvideLiquidityJettonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getProvideLiquidityTonTxParams": {
          const txParams = await router.getProvideLiquidityTonTxParams(
            provider,
            normalizeRouterProvideLiquidityTonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getSingleSideProvideLiquidityTonTxParams": {
          const txParams = await router.getSingleSideProvideLiquidityTonTxParams(
            provider,
            normalizeRouterProvideLiquidityTonTxParams(request.params)
          );

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            routerAddress: normalizedRouterAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildPoolBody: jsonSafeTool({
    description: "Build STON.fi v2_2 pool payload bodies.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      poolAddress: addressSchema,
      request: poolBodyActionSchema,
    }),
    execute: async ({ dexType, poolAddress, request }) => {
      getRpcTonClient(stonfi);
      const normalizedPoolAddress = normalizeTonAddress(poolAddress, "poolAddress");
      const pool = createPoolForDexType(dexType, normalizedPoolAddress);

      switch (request.action) {
        case "createCollectFeesBody": {
          const body = await pool.createCollectFeesBody({
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            poolAddress: normalizedPoolAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createBurnBody": {
          const normalized = normalizePoolBurnBodyParams(request.params);
          if (!("amount" in normalized)) {
            throw new Error("createBurnBody requires amount.");
          }

          const body = await pool.createBurnBody(normalized);

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            poolAddress: normalizedPoolAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildPoolTx: jsonSafeTool({
    description: "Build unsigned STON.fi v2_2 pool transactions.",
    inputSchema: z.object({
      dexType: stonfiDexTypeSchema,
      poolAddress: addressSchema,
      request: poolTxActionSchema,
    }),
    execute: async ({ dexType, poolAddress, request }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedPoolAddress = normalizeTonAddress(poolAddress, "poolAddress");
      const pool = createPoolForDexType(dexType, normalizedPoolAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedPoolAddress,
        "poolAddress"
      );

      switch (request.action) {
        case "getCollectFeeTxParams": {
          const txParams = await pool.getCollectFeeTxParams(provider, {
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            poolAddress: normalizedPoolAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getBurnTxParams": {
          const txParams = await pool.getBurnTxParams(provider, {
            amount: toAmountValue(request.params.amount, "params.amount"),
            userWalletAddress: normalizeTonAddress(
              request.params.userWalletAddress,
              "params.userWalletAddress"
            ),
            dexCustomPayload: parseOptionalBocCell(
              request.params.dexCustomPayload,
              "params.dexCustomPayload"
            ),
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            dexType,
            poolAddress: normalizedPoolAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildLpAccountBody: jsonSafeTool({
    description: "Build STON.fi v2_2 LP account payload bodies.",
    inputSchema: z.object({
      lpAccountAddress: addressSchema,
      request: lpAccountBodyActionSchema,
    }),
    execute: async ({ lpAccountAddress, request }) => {
      getRpcTonClient(stonfi);
      const normalizedLpAddress = normalizeTonAddress(
        lpAccountAddress,
        "lpAccountAddress"
      );
      const lpAccount = createLpAccount(normalizedLpAddress);

      switch (request.action) {
        case "createRefundBody": {
          const body = await lpAccount.createRefundBody({
            leftMaybePayload: parseOptionalBocCell(
              request.params.leftMaybePayload,
              "params.leftMaybePayload"
            ),
            rightMaybePayload: parseOptionalBocCell(
              request.params.rightMaybePayload,
              "params.rightMaybePayload"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createDirectAddLiquidityBody": {
          const body = await lpAccount.createDirectAddLiquidityBody({
            userWalletAddress: normalizeTonAddress(
              request.params.userWalletAddress,
              "params.userWalletAddress"
            ),
            amount0: toAmountValue(request.params.amount0, "params.amount0"),
            amount1: toAmountValue(request.params.amount1, "params.amount1"),
            minimumLpToMint: toAmountValueOptional(
              request.params.minimumLpToMint,
              "params.minimumLpToMint"
            ),
            refundAddress: normalizeOptionalTonAddress(
              request.params.refundAddress,
              "params.refundAddress"
            ),
            excessesAddress: normalizeOptionalTonAddress(
              request.params.excessesAddress,
              "params.excessesAddress"
            ),
            dexCustomPayload: parseOptionalBocCell(
              request.params.dexCustomPayload,
              "params.dexCustomPayload"
            ),
            dexCustomPayloadForwardGasAmount: toAmountValueOptional(
              request.params.dexCustomPayloadForwardGasAmount,
              "params.dexCustomPayloadForwardGasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createResetGasBody": {
          const body = await lpAccount.createResetGasBody({
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildLpAccountTx: jsonSafeTool({
    description: "Build unsigned STON.fi v2_2 LP account transactions.",
    inputSchema: z.object({
      lpAccountAddress: addressSchema,
      request: lpAccountTxActionSchema,
    }),
    execute: async ({ lpAccountAddress, request }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedLpAddress = normalizeTonAddress(
        lpAccountAddress,
        "lpAccountAddress"
      );
      const lpAccount = createLpAccount(normalizedLpAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedLpAddress,
        "lpAccountAddress"
      );

      switch (request.action) {
        case "getRefundTxParams": {
          const txParams = await lpAccount.getRefundTxParams(provider, {
            leftMaybePayload: parseOptionalBocCell(
              request.params.leftMaybePayload,
              "params.leftMaybePayload"
            ),
            rightMaybePayload: parseOptionalBocCell(
              request.params.rightMaybePayload,
              "params.rightMaybePayload"
            ),
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getDirectAddLiquidityTxParams": {
          const txParams = await lpAccount.getDirectAddLiquidityTxParams(provider, {
            userWalletAddress: normalizeTonAddress(
              request.params.userWalletAddress,
              "params.userWalletAddress"
            ),
            amount0: toAmountValue(request.params.amount0, "params.amount0"),
            amount1: toAmountValue(request.params.amount1, "params.amount1"),
            minimumLpToMint: toAmountValueOptional(
              request.params.minimumLpToMint,
              "params.minimumLpToMint"
            ),
            refundAddress: normalizeOptionalTonAddress(
              request.params.refundAddress,
              "params.refundAddress"
            ),
            excessesAddress: normalizeOptionalTonAddress(
              request.params.excessesAddress,
              "params.excessesAddress"
            ),
            dexCustomPayload: parseOptionalBocCell(
              request.params.dexCustomPayload,
              "params.dexCustomPayload"
            ),
            dexCustomPayloadForwardGasAmount: toAmountValueOptional(
              request.params.dexCustomPayloadForwardGasAmount,
              "params.dexCustomPayloadForwardGasAmount"
            ),
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getResetGasTxParams": {
          const txParams = await lpAccount.getResetGasTxParams(provider, {
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            lpAccountAddress: normalizedLpAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildVaultBody: jsonSafeTool({
    description: "Build STON.fi v2_2 vault payload bodies.",
    inputSchema: z.object({
      vaultAddress: addressSchema,
      request: vaultBodyActionSchema,
    }),
    execute: async ({ vaultAddress, request }) => {
      getRpcTonClient(stonfi);
      const normalizedVaultAddress = normalizeTonAddress(
        vaultAddress,
        "vaultAddress"
      );
      const vault = createVault(normalizedVaultAddress);
      const body = await vault.createWithdrawFeeBody({
        queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
      });

      return serializeStonfiValue({
        dexVersion: "v2_2",
        vaultAddress: normalizedVaultAddress,
        action: request.action,
        body: summarizeCell(body, true),
      });
    },
  }),
  tonStonfiDexBuildVaultTx: jsonSafeTool({
    description: "Build unsigned STON.fi v2_2 vault transactions.",
    inputSchema: z.object({
      vaultAddress: addressSchema,
      request: vaultTxActionSchema,
    }),
    execute: async ({ vaultAddress, request }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedVaultAddress = normalizeTonAddress(
        vaultAddress,
        "vaultAddress"
      );
      const vault = createVault(normalizedVaultAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedVaultAddress,
        "vaultAddress"
      );
      const txParams = await vault.getWithdrawFeeTxParams(provider, {
        gasAmount: toAmountValueOptional(request.params.gasAmount, "params.gasAmount"),
        queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
      });

      return serializeStonfiValue({
        dexVersion: "v2_2",
        vaultAddress: normalizedVaultAddress,
        action: request.action,
        txParams: toSerializedTxParams(txParams),
      });
    },
  }),
  tonStonfiDexBuildPtonBody: jsonSafeTool({
    description: "Build STON.fi pTON payload bodies.",
    inputSchema: z.object({
      proxyTonAddress: addressSchema,
      request: ptonBodyActionSchema,
    }),
    execute: async ({ proxyTonAddress, request }) => {
      getRpcTonClient(stonfi);
      const normalizedProxyTonAddress = normalizeTonAddress(
        proxyTonAddress,
        "proxyTonAddress"
      );
      const pton = createPton(normalizedProxyTonAddress);

      switch (request.action) {
        case "createTonTransferBody": {
          const body = await pton.createTonTransferBody({
            tonAmount: toAmountValue(request.params.tonAmount, "params.tonAmount"),
            refundAddress: normalizeTonAddress(
              request.params.refundAddress,
              "params.refundAddress"
            ),
            forwardPayload: parseOptionalBocCell(
              request.params.forwardPayload,
              "params.forwardPayload"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            proxyTonAddress: normalizedProxyTonAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
        case "createDeployWalletBody": {
          const body = await pton.createDeployWalletBody({
            ownerAddress: normalizeTonAddress(
              request.params.ownerAddress,
              "params.ownerAddress"
            ),
            excessAddress: normalizeTonAddress(
              request.params.excessAddress,
              "params.excessAddress"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            proxyTonAddress: normalizedProxyTonAddress,
            action: request.action,
            body: summarizeCell(body, true),
          });
        }
      }
    },
  }),
  tonStonfiDexBuildPtonTx: jsonSafeTool({
    description: "Build unsigned STON.fi pTON transactions.",
    inputSchema: z.object({
      proxyTonAddress: addressSchema,
      request: ptonTxActionSchema,
    }),
    execute: async ({ proxyTonAddress, request }) => {
      const tonClient = getRpcTonClient(stonfi);
      const normalizedProxyTonAddress = normalizeTonAddress(
        proxyTonAddress,
        "proxyTonAddress"
      );
      const pton = createPton(normalizedProxyTonAddress);
      const provider = getProviderForContract(
        tonClient,
        normalizedProxyTonAddress,
        "proxyTonAddress"
      );

      switch (request.action) {
        case "getTonTransferTxParams": {
          const txParams = await pton.getTonTransferTxParams(provider, {
            tonAmount: toAmountValue(request.params.tonAmount, "params.tonAmount"),
            destinationAddress: normalizeTonAddress(
              request.params.destinationAddress,
              "params.destinationAddress"
            ),
            destinationWalletAddress: normalizeOptionalTonAddress(
              request.params.destinationWalletAddress,
              "params.destinationWalletAddress"
            ),
            refundAddress: normalizeTonAddress(
              request.params.refundAddress,
              "params.refundAddress"
            ),
            forwardPayload: parseOptionalBocCell(
              request.params.forwardPayload,
              "params.forwardPayload"
            ),
            forwardTonAmount: toAmountValueOptional(
              request.params.forwardTonAmount,
              "params.forwardTonAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            proxyTonAddress: normalizedProxyTonAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
        case "getDeployWalletTxParams": {
          const txParams = await pton.getDeployWalletTxParams(provider, {
            ownerAddress: normalizeTonAddress(
              request.params.ownerAddress,
              "params.ownerAddress"
            ),
            excessAddress: normalizeTonAddress(
              request.params.excessAddress,
              "params.excessAddress"
            ),
            gasAmount: toAmountValueOptional(
              request.params.gasAmount,
              "params.gasAmount"
            ),
            queryId: toQueryIdValue(request.params.queryId, "params.queryId"),
          });

          return serializeStonfiValue({
            dexVersion: "v2_2",
            proxyTonAddress: normalizedProxyTonAddress,
            action: request.action,
            txParams: toSerializedTxParams(txParams),
          });
        }
      }
    },
  }),
});
