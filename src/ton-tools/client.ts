import { TonApiClient } from "@ton-api/client";

import type { TonToolsOptions } from "./types";

export const resolveBaseUrl = (options: TonToolsOptions) => {
  if (options.baseUrl) return options.baseUrl;
  if (options.network === "testnet") return "https://testnet.tonapi.io";
  return "https://tonapi.io";
};

export const createClient = (options: TonToolsOptions) =>
  new TonApiClient({
    baseUrl: resolveBaseUrl(options),
    apiKey: options.apiKey ?? process.env.TONAPI_API_KEY,
  });
