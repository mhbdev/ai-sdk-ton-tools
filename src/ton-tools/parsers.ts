import { Address, Cell } from "@ton/core";

import type { BigIntLike } from "./types";

export const parseAddress = (address: string) => Address.parse(address);

export const parseOptionalAddress = (address?: string) =>
  address ? parseAddress(address) : undefined;

export const parseAddresses = (addresses: string[]) =>
  addresses.map((address) => parseAddress(address));

export const parseLt = (value?: BigIntLike) =>
  value === undefined ? undefined : BigInt(value);

export const parseStateInit = (stateInit: string) => Cell.fromBase64(stateInit);

export const parseBocCell = (boc: string) => {
  const cells = Cell.fromBoc(Buffer.from(boc, "base64"));
  if (cells.length === 0) {
    throw new Error("BOC contains no cells.");
  }

  return { cell: cells[0], cellCount: cells.length };
};
