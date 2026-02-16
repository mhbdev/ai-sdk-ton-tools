import { TonApiClient } from "@ton-api/client";

export type TonToolsOptions = {
  apiKey?: string;
  baseUrl?: string;
  network?: "mainnet" | "testnet";
};

export type BigIntLike = string | number;

export type ToolOptions = {
  client: TonApiClient;
};
