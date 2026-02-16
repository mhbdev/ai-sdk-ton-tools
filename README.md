# AI SDK TON Tools

TON blockchain tools for the Vercel AI SDK, powered by TonAPI.

## Installation

```bash
pnpm add @mhbdev/ai-sdk-ton-tools
```

## Prerequisites

- TonAPI key from https://tonconsole.com

Set your API key:

```bash
TONAPI_API_KEY=your_api_key_here
```

## Usage

```ts
import { generateText, stepCountIs } from "ai";
import { createTonTools } from "@mhbdev/ai-sdk-ton-tools";

const tonTools = createTonTools({
  apiKey: process.env.TONAPI_API_KEY,
  network: "mainnet",
});

const { text } = await generateText({
  model: "openai/gpt-5.1-codex",
  prompt: "Get the latest events for EQB5... and summarize them.",
  tools: tonTools,
  stopWhen: stepCountIs(3),
});

console.log(text);
```

## Tool List

Accounts

- `tonGetAccount`, `tonGetAccountsBulk`, `tonGetAccountPublicKey`
- `tonGetAccountEvents`, `tonGetAccountEvent`, `tonGetAccountTraces`
- `tonGetAccountTransactions`, `tonGetAccountDiff`
- `tonGetAccountJettons`, `tonGetAccountJettonBalance`
- `tonGetAccountJettonsHistory`, `tonGetAccountJettonHistory`
- `tonGetAccountNfts`, `tonGetAccountNftHistory`
- `tonGetAccountDomains`, `tonGetAccountDnsExpiring`
- `tonGetAccountSubscriptions`, `tonGetAccountMultisigs`
- `tonGetAccountExtraCurrencyHistory`, `tonSearchAccounts`
- `tonReindexAccount`

Jettons

- `tonGetJettons`, `tonGetJettonInfo`, `tonGetJettonInfosBulk`
- `tonGetJettonHolders`, `tonGetJettonsEvent`, `tonGetJettonTransferPayload`

NFTs

- `tonGetNftCollections`, `tonGetNftCollection`, `tonGetNftCollectionItems`
- `tonGetNftItemsBulk`, `tonGetNftCollectionItemsBulk`, `tonGetNftItem`
- `tonGetNftHistoryById`

Inscriptions (Experimental)

- `tonGetAccountInscriptions`, `tonGetAccountInscriptionsHistory`
- `tonGetAccountInscriptionsHistoryByTicker`, `tonGetInscriptionOpTemplate`

DNS

- `tonResolveDns`, `tonGetDnsInfo`, `tonGetDnsBids`, `tonGetDnsAuctions`

Rates

- `tonGetRates`, `tonGetChartRates`, `tonGetMarketsRates`

Wallet & TonConnect

- `tonGetTonConnectPayload`, `tonGetAccountInfoByStateInit`
- `tonGetAccountSeqno`, `tonGetWalletsByPublicKey`, `tonTonConnectProof`

Staking

- `tonGetStakingPools`, `tonGetStakingPoolInfo`, `tonGetStakingPoolHistory`
- `tonGetAccountNominatorPools`

Storage

- `tonGetStorageProviders`

Traces & Events

- `tonGetTrace`, `tonGetEvent`

Emulation & Decoding (Local + TonAPI)

- `tonDecodeMessageBoc`, `tonDecodeTransactionBoc`
- `tonDecodeStateInitBoc`, `tonComputeAddressFromStateInit`
- `tonDecodeMessageApi`, `tonEmulateMessageToEvent`
- `tonEmulateMessageToTrace`, `tonEmulateMessageToWallet`
- `tonEmulateMessageToAccountEvent`

Blockchain

- `tonGetReducedBlockchainBlocks`
- `tonGetMasterchainHead`, `tonGetMasterchainShards`, `tonGetMasterchainBlocks`
- `tonGetMasterchainTransactions`, `tonGetBlock`, `tonGetBlockTransactions`
- `tonGetTransaction`, `tonGetTransactionByMessageHash`
- `tonGetValidators`, `tonGetBlockchainStatus`
- `tonGetBlockchainConfig`, `tonGetBlockchainConfigFromBlock`
- `tonGetRawBlockchainConfig`, `tonGetRawBlockchainConfigFromBlock`
- `tonGetBlockchainRawAccount`, `tonInspectBlockchainAccount`, `tonExecGetMethod`

Extra Currency

- `tonGetExtraCurrencyInfo`

Multisig

- `tonGetMultisigAccountInfo`

Utilities

- `tonAddressParse`, `tonAddressParseApi`
- `tonGetTonApiStatus`, `tonGetTonApiOpenapiJson`

Write, Signing & Wallet Generation

- `tonBuildCellBoc`, `tonSliceRunOperations`, `tonParseCellTree`
- `tonGenerateWalletMnemonic`, `tonMnemonicToWalletKeys`
- `tonSignData`, `tonVerifySignedData`
- `tonSafeSignCellBoc`, `tonSafeVerifyCellBocSignature`
- `tonBuildExternalMessageBoc`, `tonSendBlockchainMessage`
- `tonSendBlockchainMessageBatch`, `tonBuildAndSendExternalMessage`

## Options

```ts
type TonToolsOptions = {
  apiKey?: string;
  baseUrl?: string;
  network?: "mainnet" | "testnet";
};
```

- `apiKey` defaults to `process.env.TONAPI_API_KEY`
- `network` controls the default base URL (`mainnet` or `testnet`)
- `baseUrl` overrides `network` if provided

## License

MIT
