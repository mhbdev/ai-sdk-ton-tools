import { createClient, createStonfiRuntime } from "./ton-tools/client";
import {
  createAccountTools,
  createBlockchainTools,
  createDnsTools,
  createEmulationTools,
  createEventTools,
  createExtraCurrencyTools,
  createInscriptionsTools,
  createJettonTools,
  createMultisigTools,
  createNftTools,
  createRatesTools,
  createStakingTools,
  createStorageTools,
  createTonConnectTools,
  createTraceTools,
  createUtilityTools,
  createWalletTools,
  createWriteTools,
  createStonfiDexTools,
  createStonfiOmnistonTools,
} from "./ton-tools/domains";
import type { TonToolsOptions, ToolOptions } from "./ton-tools/types";

export type { TonToolsOptions } from "./ton-tools/types";

const createToolsFromClient = (toolOptions: ToolOptions) => ({
  ...createAccountTools(toolOptions),
  ...createJettonTools(toolOptions),
  ...createNftTools(toolOptions),
  ...createDnsTools(toolOptions),
  ...createRatesTools(toolOptions),
  ...createTonConnectTools(toolOptions),
  ...createWalletTools(toolOptions),
  ...createStakingTools(toolOptions),
  ...createStorageTools(toolOptions),
  ...createTraceTools(toolOptions),
  ...createEventTools(toolOptions),
  ...createInscriptionsTools(toolOptions),
  ...createEmulationTools(toolOptions),
  ...createExtraCurrencyTools(toolOptions),
  ...createMultisigTools(toolOptions),
  ...createBlockchainTools(toolOptions),
  ...createUtilityTools(toolOptions),
  ...createWriteTools(toolOptions),
  ...createStonfiDexTools(toolOptions),
  ...createStonfiOmnistonTools(toolOptions),
});

export const createTonTools = (options: TonToolsOptions = {}) =>
  createToolsFromClient({
    client: createClient(options),
    stonfi: createStonfiRuntime(options),
  });

export type TonToolset = ReturnType<typeof createTonTools>;
