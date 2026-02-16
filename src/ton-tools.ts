import { createClient } from "./ton-tools/client";
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
} from "./ton-tools/domains";
import type { TonToolsOptions } from "./ton-tools/types";

export type { TonToolsOptions } from "./ton-tools/types";

const createToolsFromClient = (client: ReturnType<typeof createClient>) => ({
  ...createAccountTools({ client }),
  ...createJettonTools({ client }),
  ...createNftTools({ client }),
  ...createDnsTools({ client }),
  ...createRatesTools({ client }),
  ...createTonConnectTools({ client }),
  ...createWalletTools({ client }),
  ...createStakingTools({ client }),
  ...createStorageTools({ client }),
  ...createTraceTools({ client }),
  ...createEventTools({ client }),
  ...createInscriptionsTools({ client }),
  ...createEmulationTools({ client }),
  ...createExtraCurrencyTools({ client }),
  ...createMultisigTools({ client }),
  ...createBlockchainTools({ client }),
  ...createUtilityTools({ client }),
  ...createWriteTools({ client }),
});

export const createTonTools = (options: TonToolsOptions = {}) =>
  createToolsFromClient(createClient(options));

export type TonToolset = ReturnType<typeof createTonTools>;
