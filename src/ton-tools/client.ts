import { TonApiClient } from "@ton-api/client";
import { TonClient } from "@ton/ton";

import type { StonfiRuntime, TonToolsOptions } from "./types";

export const resolveBaseUrl = (options: TonToolsOptions) => {
  if (options.baseUrl) return options.baseUrl;
  if (options.network === "testnet") return "https://testnet.tonapi.io";
  return "https://tonapi.io";
};

export const resolveStonfiRpcEndpoint = (options: TonToolsOptions) =>
  options.stonfiRpcEndpoint ?? process.env.TON_RPC_ENDPOINT;

export const resolveStonfiRpcApiKey = (options: TonToolsOptions) =>
  options.stonfiRpcApiKey ?? process.env.TON_RPC_API_KEY;

export const resolveStonfiOmnistonApiUrl = (options: TonToolsOptions) =>
  options.stonfiOmnistonApiUrl ??
  process.env.STONFI_OMNISTON_API_URL ??
  "wss://omni-ws.ston.fi";

const assertStonfiRpcEndpoint = (endpoint: string | undefined) => {
  if (endpoint && endpoint.trim().length > 0) {
    return endpoint.trim();
  }

  throw new Error(
    "STON.fi DEX tools require TON RPC endpoint. Set TonToolsOptions.stonfiRpcEndpoint or TON_RPC_ENDPOINT."
  );
};

export const createClient = (options: TonToolsOptions) =>
  new TonApiClient({
    baseUrl: resolveBaseUrl(options),
    apiKey: options.apiKey ?? process.env.TONAPI_API_KEY,
  });

export const createStonfiRuntime = (options: TonToolsOptions): StonfiRuntime => {
  let tonClient: TonClient | null = null;

  return {
    getRpcEndpoint: () => resolveStonfiRpcEndpoint(options),
    getRpcApiKey: () => resolveStonfiRpcApiKey(options),
    getOmnistonApiUrl: () => resolveStonfiOmnistonApiUrl(options),
    getTonClient: () => {
      if (tonClient) {
        return tonClient;
      }

      const endpoint = assertStonfiRpcEndpoint(resolveStonfiRpcEndpoint(options));
      tonClient = new TonClient({
        endpoint,
        apiKey: resolveStonfiRpcApiKey(options),
      });

      return tonClient;
    },
  };
};
