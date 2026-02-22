import { DEX, pTON } from "@ston-fi/sdk";
import { Address, Cell, type TonClient } from "@ton/ton";
import { z } from "zod";

import type { StonfiRuntime } from "../types";

export const stonfiDexTypeSchema = z
  .enum([
    "constant_product",
    "stableswap",
    "weighted_const_product",
    "weighted_stableswap",
  ])
  .describe("STON.fi DEX router/pool type.");

export type StonfiDexType = z.infer<typeof stonfiDexTypeSchema>;

export const amountLikeSchema = z
  .union([z.string().min(1), z.number().int()])
  .describe("Integer amount in base units as decimal string or integer.");

export type AmountLikeInput = z.infer<typeof amountLikeSchema>;

export const queryIdLikeSchema = z
  .union([z.string().min(1), z.number().int()])
  .describe("Optional query id as decimal string or integer.");

export type QueryIdLikeInput = z.infer<typeof queryIdLikeSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parseTonAddressOrThrow = (value: string, label: string) => {
  try {
    return Address.parse(value);
  } catch {
    throw new Error(`${label} must be a valid TON address.`);
  }
};

export const normalizeTonAddress = (value: string, label: string) =>
  parseTonAddressOrThrow(value, label).toString();

export const normalizeOptionalTonAddress = (
  value: string | undefined,
  label: string
) => (value ? normalizeTonAddress(value, label) : undefined);

export const parseBocCellOrThrow = (boc: string, label: string) => {
  try {
    return Cell.fromBase64(boc);
  } catch {
    throw new Error(`${label} must be a valid base64 BOC.`);
  }
};

export const parseOptionalBocCell = (
  boc: string | undefined,
  label: string
) => (boc ? parseBocCellOrThrow(boc, label) : undefined);

export const toAmountValue = (value: AmountLikeInput, label: string) => {
  const normalized = typeof value === "number" ? String(value) : value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${label} must be an integer value.`);
  }
  return normalized;
};

export const toAmountValueOptional = (
  value: AmountLikeInput | undefined,
  label: string
) => (value === undefined ? undefined : toAmountValue(value, label));

export const toQueryIdValue = (
  value: QueryIdLikeInput | undefined,
  label: string
) => {
  if (value === undefined) return undefined;
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be a valid integer query id.`);
  }
};

export const summarizeCell = (cell: Cell, includeBoc = true) => ({
  hash: cell.hash().toString("hex"),
  bits: cell.bits.length,
  refs: cell.refs.length,
  isExotic: cell.isExotic,
  ...(includeBoc ? { boc: cell.toBoc().toString("base64") } : {}),
});

export const serializeStonfiValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Address) {
    return value.toString();
  }

  if (value instanceof Cell) {
    return summarizeCell(value, true);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, item]) => ({
      key: serializeStonfiValue(key, seen),
      value: serializeStonfiValue(item, seen),
    }));
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((item) =>
      serializeStonfiValue(item, seen)
    );
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeStonfiValue(item, seen));
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = serializeStonfiValue(nested, seen);
    }
    return result;
  }

  return value;
};

const routerConstructors = {
  constant_product: DEX.v2_2.Router.CPI,
  stableswap: DEX.v2_2.Router.Stable,
  weighted_const_product: DEX.v2_2.Router.WCPI,
  weighted_stableswap: DEX.v2_2.Router.WStable,
} as const;

const poolConstructors = {
  constant_product: DEX.v2_2.Pool.CPI,
  stableswap: DEX.v2_2.Pool.Stable,
  weighted_const_product: DEX.v2_2.Pool.WCPI,
  weighted_stableswap: DEX.v2_2.Pool.WStable,
} as const;

export const createRouterForDexType = (
  dexType: StonfiDexType,
  routerAddress: string
) => {
  const Router = routerConstructors[dexType];
  return new Router(normalizeTonAddress(routerAddress, "routerAddress"));
};

export const createPoolForDexType = (
  dexType: StonfiDexType,
  poolAddress: string
) => {
  const Pool = poolConstructors[dexType];
  return new Pool(normalizeTonAddress(poolAddress, "poolAddress"));
};

export const createLpAccount = (address: string) =>
  new DEX.v2_2.LpAccount(normalizeTonAddress(address, "lpAccountAddress"));

export const createVault = (address: string) =>
  new DEX.v2_2.Vault(normalizeTonAddress(address, "vaultAddress"));

export const createPton = (
  address: string
): InstanceType<(typeof pTON)["v2_1"]> =>
  new DEX.v2_2.pTON(
    normalizeTonAddress(address, "proxyTonAddress")
  ) as InstanceType<(typeof pTON)["v2_1"]>;

export const getRpcTonClient = (stonfi: StonfiRuntime): TonClient => {
  try {
    return stonfi.getTonClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown STON.fi RPC error.";
    throw new Error(message);
  }
};

export const getProviderForContract = (
  tonClient: TonClient,
  address: string,
  label: string
) => tonClient.provider(parseTonAddressOrThrow(address, label));
