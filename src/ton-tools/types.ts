import { TonApiClient } from "@ton-api/client";
import type { TonClient } from "@ton/ton";

export type TonToolsOptions = {
  apiKey?: string;
  baseUrl?: string;
  network?: "mainnet" | "testnet";
  stonfiRpcEndpoint?: string;
  stonfiRpcApiKey?: string;
  stonfiOmnistonApiUrl?: string;
};

export type BigIntLike = string | number;

export type StonfiRuntime = {
  getRpcEndpoint: () => string | undefined;
  getRpcApiKey: () => string | undefined;
  getOmnistonApiUrl: () => string;
  getTonClient: () => TonClient;
};

export type ToolOptions = {
  client: TonApiClient;
  stonfi: StonfiRuntime;
};
