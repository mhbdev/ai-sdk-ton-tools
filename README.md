# AI SDK TON Tools

TON blockchain tools for the Vercel AI SDK, powered by TonAPI + STON.fi SDKs.

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

Optional STON.fi settings (required for STON.fi DEX tools):

```bash
TON_RPC_ENDPOINT=https://ton-rpc.example.com/jsonRPC
TON_RPC_API_KEY=your_ton_rpc_key
STONFI_OMNISTON_API_URL=wss://omni-ws.ston.fi
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

STON.fi DEX (v2_2, unsigned/read capability tools)

- `tonStonfiDexGetRouterData`
- `tonStonfiDexResolveAddresses`
- `tonStonfiDexGetPoolData`
- `tonStonfiDexGetLpAccountData`
- `tonStonfiDexGetVaultData`
- `tonStonfiDexBuildRouterBody`
- `tonStonfiDexBuildRouterTx`
- `tonStonfiDexBuildPoolBody`
- `tonStonfiDexBuildPoolTx`
- `tonStonfiDexBuildLpAccountBody`
- `tonStonfiDexBuildLpAccountTx`
- `tonStonfiDexBuildVaultBody`
- `tonStonfiDexBuildVaultTx`
- `tonStonfiDexBuildPtonBody`
- `tonStonfiDexBuildPtonTx`

STON.fi Omniston (bounded snapshots + unsigned builders)

- `tonStonfiOmnistonRequestQuotes`
- `tonStonfiOmnistonBuildTransfer`
- `tonStonfiOmnistonBuildWithdrawal`
- `tonStonfiOmnistonTrackTrade`
- `tonStonfiOmnistonEscrowList`

## Options

```ts
type TonToolsOptions = {
  apiKey?: string;
  baseUrl?: string;
  network?: "mainnet" | "testnet";
  stonfiRpcEndpoint?: string;
  stonfiRpcApiKey?: string;
  stonfiOmnistonApiUrl?: string;
};
```

- `apiKey` defaults to `process.env.TONAPI_API_KEY`
- `network` controls the default base URL (`mainnet` or `testnet`)
- `baseUrl` overrides `network` if provided
- `stonfiRpcEndpoint` defaults to `process.env.TON_RPC_ENDPOINT` and is required by STON.fi DEX tools
- `stonfiRpcApiKey` defaults to `process.env.TON_RPC_API_KEY`
- `stonfiOmnistonApiUrl` defaults to `process.env.STONFI_OMNISTON_API_URL` and falls back to `wss://omni-ws.ston.fi`

## STON.fi Write Behavior

STON.fi tools intentionally expose read operations plus unsigned body/transaction preparation only.
`send*` contract methods are not exposed; signing/sending stays under your app or wallet flow.

## License

MIT
