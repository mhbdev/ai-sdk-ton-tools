import * as _ton_core from '@ton/core';
import * as _ton_api_client from '@ton-api/client';
import * as ai from 'ai';

type TonToolsOptions = {
    apiKey?: string;
    baseUrl?: string;
    network?: "mainnet" | "testnet";
    stonfiRpcEndpoint?: string;
    stonfiRpcApiKey?: string;
    stonfiOmnistonApiUrl?: string;
};

type CellTreeNode = {
    hash: string;
    bits: number;
    refsCount: number;
    isExotic: boolean;
    boc?: string;
    children: Array<CellTreeNode | {
        hash: string;
    }>;
};

declare const createTonTools: (options?: TonToolsOptions) => {
    tonStonfiOmnistonRequestQuotes: ai.Tool<{
        request: {
            amount: {
                bidUnits?: string | number | undefined;
                askUnits?: string | number | undefined;
            };
            settlementMethods: ("SETTLEMENT_METHOD_SWAP" | "SETTLEMENT_METHOD_ESCROW" | "SETTLEMENT_METHOD_HTLC")[];
            bidAssetAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
            askAssetAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
            referrerAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
            referrerFeeBps?: number | undefined;
            settlementParams?: {
                gaslessSettlement: "GASLESS_SETTLEMENT_PROHIBITED" | "GASLESS_SETTLEMENT_POSSIBLE" | "GASLESS_SETTLEMENT_REQUIRED";
                maxPriceSlippageBps?: number | undefined;
                maxOutgoingMessages?: number | undefined;
                flexibleReferrerFee?: boolean | undefined;
            } | undefined;
        };
        timeoutMs: number;
        maxEvents: number;
    }, unknown>;
    tonStonfiOmnistonBuildTransfer: ai.Tool<{
        request: {
            sourceAddress: string | {
                blockchain: number;
                address: string;
            };
            destinationAddress: string | {
                blockchain: number;
                address: string;
            };
            quote: unknown;
            useRecommendedSlippage: boolean;
            gasExcessAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
            refundAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
        };
    }, unknown>;
    tonStonfiOmnistonBuildWithdrawal: ai.Tool<{
        request: {
            sourceAddress: string | {
                blockchain: number;
                address: string;
            };
            quoteId: string;
            gasExcessAddress?: string | {
                blockchain: number;
                address: string;
            } | undefined;
        };
    }, unknown>;
    tonStonfiOmnistonTrackTrade: ai.Tool<{
        request: {
            quoteId: string;
            traderWalletAddress: string | {
                blockchain: number;
                address: string;
            };
            outgoingTxHash: string;
        };
        timeoutMs: number;
        maxEvents: number;
    }, unknown>;
    tonStonfiOmnistonEscrowList: ai.Tool<{
        request: {
            traderWalletAddress: string | {
                blockchain: number;
                address: string;
            };
        };
    }, unknown>;
    tonStonfiDexGetRouterData: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        routerAddress: string;
    }, unknown>;
    tonStonfiDexResolveAddresses: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        routerAddress: string;
        includePoolData: boolean;
        includeVaultData: boolean;
        token0Address?: string | undefined;
        token1Address?: string | undefined;
        userAddress?: string | undefined;
        tokenWalletAddress?: string | undefined;
        tokenMinterAddress?: string | undefined;
    }, unknown>;
    tonStonfiDexGetPoolData: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        poolAddress: string;
        includeLpAccountData: boolean;
        includeJettonWalletData: boolean;
        ownerAddress?: string | undefined;
        jettonWalletOwnerAddress?: string | undefined;
    }, unknown>;
    tonStonfiDexGetLpAccountData: ai.Tool<{
        lpAccountAddress: string;
    }, unknown>;
    tonStonfiDexGetVaultData: ai.Tool<{
        vaultAddress: string;
    }, unknown>;
    tonStonfiDexBuildRouterBody: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        routerAddress: string;
        request: {
            action: "createSwapBody";
            params: {
                askJettonWalletAddress: string;
                receiverAddress: string;
                minAskAmount: string | number;
                refundAddress: string;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                refundPayload?: string | undefined;
                refundForwardGasAmount?: string | number | undefined;
                referralAddress?: string | undefined;
                referralValue?: string | number | undefined;
                deadline?: number | undefined;
            };
        } | {
            action: "createCrossSwapBody";
            params: {
                askJettonWalletAddress: string;
                receiverAddress: string;
                minAskAmount: string | number;
                refundAddress: string;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                refundPayload?: string | undefined;
                refundForwardGasAmount?: string | number | undefined;
                referralAddress?: string | undefined;
                referralValue?: string | number | undefined;
                deadline?: number | undefined;
            };
        } | {
            action: "createProvideLiquidityBody";
            params: {
                routerWalletAddress: string;
                minLpOut: string | number;
                receiverAddress: string;
                refundAddress: string;
                bothPositive: boolean;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildRouterTx: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        routerAddress: string;
        request: {
            action: "getSwapJettonToJettonTxParams";
            params: {
                userWalletAddress: string;
                offerJettonAddress: string;
                askJettonAddress: string;
                offerAmount: string | number;
                minAskAmount: string | number;
                receiverAddress?: string | undefined;
                offerJettonWalletAddress?: string | undefined;
                askJettonWalletAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                referralAddress?: string | undefined;
                referralValue?: string | number | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                refundPayload?: string | undefined;
                refundForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                gasAmount?: string | number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
                jettonCustomPayload?: string | undefined;
                transferExcessAddress?: string | undefined;
            };
        } | {
            action: "getSwapJettonToTonTxParams";
            params: {
                userWalletAddress: string;
                offerJettonAddress: string;
                proxyTonAddress: string;
                offerAmount: string | number;
                minAskAmount: string | number;
                receiverAddress?: string | undefined;
                offerJettonWalletAddress?: string | undefined;
                askJettonWalletAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                referralAddress?: string | undefined;
                referralValue?: string | number | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                refundPayload?: string | undefined;
                refundForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                gasAmount?: string | number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
                jettonCustomPayload?: string | undefined;
                transferExcessAddress?: string | undefined;
            };
        } | {
            action: "getSwapTonToJettonTxParams";
            params: {
                userWalletAddress: string;
                proxyTonAddress: string;
                askJettonAddress: string;
                offerAmount: string | number;
                minAskAmount: string | number;
                receiverAddress?: string | undefined;
                offerJettonWalletAddress?: string | undefined;
                askJettonWalletAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                referralAddress?: string | undefined;
                referralValue?: string | number | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                refundPayload?: string | undefined;
                refundForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getProvideLiquidityJettonTxParams";
            params: {
                userWalletAddress: string;
                sendTokenAddress: string;
                otherTokenAddress: string;
                sendAmount: string | number;
                minLpOut: string | number;
                receiverAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                gasAmount?: string | number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
                jettonCustomPayload?: string | undefined;
                transferExcessAddress?: string | undefined;
            };
        } | {
            action: "getSingleSideProvideLiquidityJettonTxParams";
            params: {
                userWalletAddress: string;
                sendTokenAddress: string;
                otherTokenAddress: string;
                sendAmount: string | number;
                minLpOut: string | number;
                receiverAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                gasAmount?: string | number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
                jettonCustomPayload?: string | undefined;
                transferExcessAddress?: string | undefined;
            };
        } | {
            action: "getProvideLiquidityTonTxParams";
            params: {
                userWalletAddress: string;
                proxyTonAddress: string;
                otherTokenAddress: string;
                sendAmount: string | number;
                minLpOut: string | number;
                receiverAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                bothPositive?: boolean | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getSingleSideProvideLiquidityTonTxParams";
            params: {
                userWalletAddress: string;
                proxyTonAddress: string;
                otherTokenAddress: string;
                sendAmount: string | number;
                minLpOut: string | number;
                receiverAddress?: string | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                bothPositive?: boolean | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                deadline?: number | undefined;
                forwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildPoolBody: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        poolAddress: string;
        request: {
            action: "createCollectFeesBody";
            params: {
                queryId?: string | number | undefined;
            };
        } | {
            action: "createBurnBody";
            params: {
                amount: string | number;
                dexCustomPayload?: string | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildPoolTx: ai.Tool<{
        dexType: "constant_product" | "stableswap" | "weighted_const_product" | "weighted_stableswap";
        poolAddress: string;
        request: {
            action: "getCollectFeeTxParams";
            params: {
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getBurnTxParams";
            params: {
                amount: string | number;
                userWalletAddress: string;
                dexCustomPayload?: string | undefined;
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildLpAccountBody: ai.Tool<{
        lpAccountAddress: string;
        request: {
            action: "createRefundBody";
            params: {
                leftMaybePayload?: string | undefined;
                rightMaybePayload?: string | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "createDirectAddLiquidityBody";
            params: {
                userWalletAddress: string;
                amount0: string | number;
                amount1: string | number;
                minimumLpToMint?: string | number | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "createResetGasBody";
            params: {
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildLpAccountTx: ai.Tool<{
        lpAccountAddress: string;
        request: {
            action: "getRefundTxParams";
            params: {
                leftMaybePayload?: string | undefined;
                rightMaybePayload?: string | undefined;
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getDirectAddLiquidityTxParams";
            params: {
                userWalletAddress: string;
                amount0: string | number;
                amount1: string | number;
                minimumLpToMint?: string | number | undefined;
                refundAddress?: string | undefined;
                excessesAddress?: string | undefined;
                dexCustomPayload?: string | undefined;
                dexCustomPayloadForwardGasAmount?: string | number | undefined;
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getResetGasTxParams";
            params: {
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildVaultBody: ai.Tool<{
        vaultAddress: string;
        request: {
            action: "createWithdrawFeeBody";
            params: {
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildVaultTx: ai.Tool<{
        vaultAddress: string;
        request: {
            action: "getWithdrawFeeTxParams";
            params: {
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildPtonBody: ai.Tool<{
        proxyTonAddress: string;
        request: {
            action: "createTonTransferBody";
            params: {
                tonAmount: string | number;
                refundAddress: string;
                forwardPayload?: string | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "createDeployWalletBody";
            params: {
                ownerAddress: string;
                excessAddress: string;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonStonfiDexBuildPtonTx: ai.Tool<{
        proxyTonAddress: string;
        request: {
            action: "getTonTransferTxParams";
            params: {
                tonAmount: string | number;
                destinationAddress: string;
                refundAddress: string;
                destinationWalletAddress?: string | undefined;
                forwardPayload?: string | undefined;
                forwardTonAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        } | {
            action: "getDeployWalletTxParams";
            params: {
                ownerAddress: string;
                excessAddress: string;
                gasAmount?: string | number | undefined;
                queryId?: string | number | undefined;
            };
        };
    }, unknown>;
    tonBuildCellBoc: ai.Tool<{
        operations: ({
            type: "bit";
            value: number | boolean;
        } | {
            type: "uint";
            value: string | number;
            bits: number;
        } | {
            type: "int";
            value: string | number;
            bits: number;
        } | {
            type: "varUint";
            value: string | number;
            bits: number;
        } | {
            type: "varInt";
            value: string | number;
            bits: number;
        } | {
            type: "coins";
            value: string | number;
        } | {
            type: "address";
            value?: string | null | undefined;
        } | {
            type: "buffer";
            value: string;
            encoding: "utf8" | "base64" | "hex";
            bytes?: number | undefined;
        } | {
            type: "stringTail";
            value: string;
        } | {
            type: "stringRefTail";
            value: string;
        } | {
            type: "bocRef";
            boc: string;
        } | {
            type: "bocSlice";
            boc: string;
        } | {
            type: "maybeRef";
            boc?: string | undefined;
        })[];
        exotic: boolean;
    }, {
        boc: string;
        hash: string;
        bits: number;
        refs: number;
        isExotic: boolean;
        operationsApplied: number;
    }>;
    tonSliceRunOperations: ai.Tool<{
        boc: string;
        operations: ({
            type: "skip";
            bits: number;
            name?: string | undefined;
        } | {
            type: "remaining";
            name?: string | undefined;
        } | {
            type: "loadBit";
            name?: string | undefined;
        } | {
            type: "loadBoolean";
            name?: string | undefined;
        } | {
            type: "loadUint";
            bits: number;
            mode: "string" | "number";
            name?: string | undefined;
        } | {
            type: "loadInt";
            bits: number;
            mode: "string" | "number";
            name?: string | undefined;
        } | {
            type: "loadVarUint";
            bits: number;
            mode: "string" | "number";
            name?: string | undefined;
        } | {
            type: "loadVarInt";
            bits: number;
            mode: "string" | "number";
            name?: string | undefined;
        } | {
            type: "loadCoins";
            name?: string | undefined;
        } | {
            type: "loadAddress";
            name?: string | undefined;
        } | {
            type: "loadMaybeAddress";
            name?: string | undefined;
        } | {
            type: "loadAddressAny";
            name?: string | undefined;
        } | {
            type: "loadBuffer";
            bytes: number;
            outputEncoding: "utf8" | "base64" | "hex";
            name?: string | undefined;
        } | {
            type: "loadBits";
            bits: number;
            name?: string | undefined;
        } | {
            type: "loadStringTail";
            name?: string | undefined;
        } | {
            type: "loadMaybeStringTail";
            name?: string | undefined;
        } | {
            type: "loadStringRefTail";
            name?: string | undefined;
        } | {
            type: "loadMaybeStringRefTail";
            name?: string | undefined;
        } | {
            type: "loadRef";
            includeBoc: boolean;
            name?: string | undefined;
        } | {
            type: "loadMaybeRef";
            includeBoc: boolean;
            name?: string | undefined;
        } | {
            type: "endParse";
            name?: string | undefined;
        })[];
        strictEndParse: boolean;
        includeRemainderBoc: boolean;
    }, {
        cellCount: number;
        operationsApplied: number;
        results: {
            index: number;
            type: "skip" | "remaining" | "loadBit" | "loadBoolean" | "loadUint" | "loadInt" | "loadVarUint" | "loadVarInt" | "loadCoins" | "loadAddress" | "loadMaybeAddress" | "loadAddressAny" | "loadBuffer" | "loadBits" | "loadStringTail" | "loadMaybeStringTail" | "loadStringRefTail" | "loadMaybeStringRefTail" | "loadRef" | "loadMaybeRef" | "endParse";
            name: string | null;
            value: string | number | boolean | {
                boc?: string | undefined;
                hash: string;
                bits: number;
                refs: number;
                isExotic: boolean;
            } | {
                skippedBits: number;
                remainingBits?: undefined;
                remainingRefs?: undefined;
                bits?: undefined;
                length?: undefined;
                byteAlignedHex?: undefined;
                byteAlignedBase64?: undefined;
                ended?: undefined;
            } | {
                remainingBits: number;
                remainingRefs: number;
                skippedBits?: undefined;
                bits?: undefined;
                length?: undefined;
                byteAlignedHex?: undefined;
                byteAlignedBase64?: undefined;
                ended?: undefined;
            } | {
                bits: string;
                length: number;
                byteAlignedHex: string | null;
                byteAlignedBase64: string | null;
                skippedBits?: undefined;
                remainingBits?: undefined;
                remainingRefs?: undefined;
                ended?: undefined;
            } | {
                ended: boolean;
                skippedBits?: undefined;
                remainingBits?: undefined;
                remainingRefs?: undefined;
                bits?: undefined;
                length?: undefined;
                byteAlignedHex?: undefined;
                byteAlignedBase64?: undefined;
            } | null;
        }[];
        remainingBits: number;
        remainingRefs: number;
        remainderBoc: string | undefined;
    }>;
    tonParseCellTree: ai.Tool<{
        boc: string;
        maxDepth: number;
        includeBoc: boolean;
    }, {
        cellCount: number;
        rootHash: string;
        maxDepth: number;
        tree: CellTreeNode;
    }>;
    tonGenerateWalletMnemonic: ai.Tool<{
        wordsCount: number;
        includeSecretKey: boolean;
        password?: string | undefined;
    }, {
        secretKeyHex?: string | undefined;
        secretKeyBase64?: string | undefined;
        publicKeyHex: string;
        publicKeyBase64: string;
        mnemonic: string[];
        mnemonicPhrase: string;
    }>;
    tonMnemonicToWalletKeys: ai.Tool<{
        mnemonic: string | string[];
        includeSecretKey: boolean;
        password?: string | undefined;
    }, {
        secretKeyHex?: string | undefined;
        secretKeyBase64?: string | undefined;
        publicKeyHex: string;
        publicKeyBase64: string;
        mnemonic: string[];
        mnemonicPhrase: string;
    }>;
    tonSignData: ai.Tool<{
        data: string;
        dataEncoding: "utf8" | "base64" | "hex";
        secretKey: string;
        secretKeyEncoding: "base64" | "hex";
    }, {
        signatureHex: string;
        signatureBase64: string;
    }>;
    tonVerifySignedData: ai.Tool<{
        data: string;
        dataEncoding: "utf8" | "base64" | "hex";
        signature: string;
        signatureEncoding: "base64" | "hex";
        publicKey: string;
        publicKeyEncoding: "base64" | "hex";
    }, {
        isValid: boolean;
    }>;
    tonSafeSignCellBoc: ai.Tool<{
        boc: string;
        secretKey: string;
        secretKeyEncoding: "base64" | "hex";
        seed?: string | undefined;
    }, {
        signatureHex: string;
        signatureBase64: string;
    }>;
    tonSafeVerifyCellBocSignature: ai.Tool<{
        boc: string;
        signature: string;
        signatureEncoding: "base64" | "hex";
        publicKey: string;
        publicKeyEncoding: "base64" | "hex";
        seed?: string | undefined;
    }, {
        isValid: boolean;
    }>;
    tonBuildExternalMessageBoc: ai.Tool<{
        to: string;
        bodyBoc?: string | undefined;
        bodyComment?: string | undefined;
        stateInitBoc?: string | undefined;
    }, {
        destination: string;
        boc: string;
        hash: string;
    }>;
    tonSendBlockchainMessage: ai.Tool<{
        boc: string;
        meta?: Record<string, string> | undefined;
    }, any>;
    tonSendBlockchainMessageBatch: ai.Tool<{
        bocs: string[];
        meta?: Record<string, string> | undefined;
    }, any>;
    tonBuildAndSendExternalMessage: ai.Tool<{
        to: string;
        bodyBoc?: string | undefined;
        bodyComment?: string | undefined;
        stateInitBoc?: string | undefined;
        meta?: Record<string, string> | undefined;
    }, {
        destination: string;
        boc: string;
        hash: string;
        sendResult: any;
    }>;
    tonGetTonApiStatus: ai.Tool<Record<string, never>, _ton_api_client.ServiceStatus>;
    tonGetTonApiOpenapiJson: ai.Tool<Record<string, never>, any>;
    tonAddressParseApi: ai.Tool<{
        address: string;
    }, _ton_api_client.AddressParseData>;
    tonAddressParse: ai.Tool<{
        address: string;
    }, {
        raw: string;
        workchain: number;
        hash: string;
        friendly: {
            bounceable: string;
            nonBounceable: string;
            bounceableTestnet: string;
            nonBounceableTestnet: string;
        };
        flags: {
            isFriendly: boolean;
            isRaw: boolean;
            isBounceable: boolean | null;
            isTestOnly: boolean | null;
        };
    }>;
    tonGetReducedBlockchainBlocks: ai.Tool<{
        from: number;
        to: number;
    }, _ton_api_client.ReducedBlocks>;
    tonGetMasterchainHead: ai.Tool<Record<string, never>, _ton_api_client.BlockchainBlock>;
    tonGetMasterchainShards: ai.Tool<{
        masterchainSeqno: number;
    }, _ton_api_client.BlockchainBlockShards>;
    tonGetMasterchainBlocks: ai.Tool<{
        masterchainSeqno: number;
    }, _ton_api_client.BlockchainBlocks>;
    tonGetMasterchainTransactions: ai.Tool<{
        masterchainSeqno: number;
    }, _ton_api_client.Transactions>;
    tonGetBlock: ai.Tool<{
        blockId: string;
    }, _ton_api_client.BlockchainBlock>;
    tonGetBlockTransactions: ai.Tool<{
        blockId: string;
    }, _ton_api_client.Transactions>;
    tonGetTransaction: ai.Tool<{
        transactionId: string;
    }, _ton_api_client.Transaction>;
    tonGetTransactionByMessageHash: ai.Tool<{
        messageHash: string;
    }, _ton_api_client.Transaction>;
    tonGetValidators: ai.Tool<Record<string, never>, _ton_api_client.Validators>;
    tonGetBlockchainConfig: ai.Tool<Record<string, never>, _ton_api_client.BlockchainConfig>;
    tonGetBlockchainConfigFromBlock: ai.Tool<{
        masterchainSeqno: number;
    }, _ton_api_client.BlockchainConfig>;
    tonGetRawBlockchainConfig: ai.Tool<Record<string, never>, _ton_api_client.RawBlockchainConfig>;
    tonGetRawBlockchainConfigFromBlock: ai.Tool<{
        masterchainSeqno: number;
    }, _ton_api_client.RawBlockchainConfig>;
    tonGetBlockchainRawAccount: ai.Tool<{
        address: string;
    }, _ton_api_client.BlockchainRawAccount>;
    tonInspectBlockchainAccount: ai.Tool<{
        address: string;
    }, _ton_api_client.BlockchainAccountInspect>;
    tonGetBlockchainStatus: ai.Tool<Record<string, never>, _ton_api_client.ServiceStatus>;
    tonExecGetMethod: ai.Tool<{
        address: string;
        methodName: string;
        args?: string[] | undefined;
        fixOrder?: boolean | undefined;
    }, _ton_api_client.MethodExecutionResult>;
    tonGetMultisigAccountInfo: ai.Tool<{
        address: string;
    }, _ton_api_client.Multisig>;
    tonGetExtraCurrencyInfo: ai.Tool<{
        currencyId: number;
    }, _ton_api_client.EcPreview>;
    tonDecodeMessageBoc: ai.Tool<{
        boc: string;
        relaxed?: boolean | undefined;
        includeBodyBoc?: boolean | undefined;
        includeInitBoc?: boolean | undefined;
    }, {
        cellCount: number;
        message: {
            info: {
                type: "internal";
                ihrDisabled: boolean;
                bounce: boolean;
                bounced: boolean;
                src: string | null;
                dest: string | null;
                value: {
                    coins: string;
                    other: {
                        id: number;
                        amount: string;
                    }[] | undefined;
                };
                ihrFee: string;
                forwardFee: string;
                createdLt: string;
                createdAt: number;
            } | {
                type: "external-out";
                src: string | null;
                dest: string | null;
                createdLt: string;
                createdAt: number;
                ihrDisabled?: undefined;
                bounce?: undefined;
                bounced?: undefined;
                value?: undefined;
                ihrFee?: undefined;
                forwardFee?: undefined;
            };
            init: {
                splitDepth: number | null;
                special: _ton_core.TickTock | null;
                code: {
                    boc?: string | undefined;
                    hash: string;
                    bits: number;
                    refs: number;
                    isExotic: boolean;
                } | null;
                data: {
                    boc?: string | undefined;
                    hash: string;
                    bits: number;
                    refs: number;
                    isExotic: boolean;
                } | null;
                librariesCount: number;
            } | null;
            body: {
                boc?: string | undefined;
                hash: string;
                bits: number;
                refs: number;
                isExotic: boolean;
            };
        };
    } | {
        cellCount: number;
        message: {
            info: {
                type: "internal";
                ihrDisabled: boolean;
                bounce: boolean;
                bounced: boolean;
                src: string | null;
                dest: string | null;
                value: {
                    coins: string;
                    other: {
                        id: number;
                        amount: string;
                    }[] | undefined;
                };
                ihrFee: string;
                forwardFee: string;
                createdLt: string;
                createdAt: number;
                importFee?: undefined;
            } | {
                type: "external-in";
                src: string | null;
                dest: string | null;
                importFee: string;
                ihrDisabled?: undefined;
                bounce?: undefined;
                bounced?: undefined;
                value?: undefined;
                ihrFee?: undefined;
                forwardFee?: undefined;
                createdLt?: undefined;
                createdAt?: undefined;
            } | {
                type: "external-out";
                src: string | null;
                dest: string | null;
                createdLt: string;
                createdAt: number;
                ihrDisabled?: undefined;
                bounce?: undefined;
                bounced?: undefined;
                value?: undefined;
                ihrFee?: undefined;
                forwardFee?: undefined;
                importFee?: undefined;
            };
            init: {
                splitDepth: number | null;
                special: _ton_core.TickTock | null;
                code: {
                    boc?: string | undefined;
                    hash: string;
                    bits: number;
                    refs: number;
                    isExotic: boolean;
                } | null;
                data: {
                    boc?: string | undefined;
                    hash: string;
                    bits: number;
                    refs: number;
                    isExotic: boolean;
                } | null;
                librariesCount: number;
            } | null;
            body: {
                boc?: string | undefined;
                hash: string;
                bits: number;
                refs: number;
                isExotic: boolean;
            };
        };
    }>;
    tonDecodeTransactionBoc: ai.Tool<{
        boc: string;
        includeMessages?: boolean | undefined;
        includeBodyBoc?: boolean | undefined;
        includeInitBoc?: boolean | undefined;
    }, {
        cellCount: number;
        transaction: {
            address: string;
            lt: string;
            prevTransactionHash: string;
            prevTransactionLt: string;
            now: number;
            outMessagesCount: number;
            oldStatus: _ton_core.AccountStatus;
            endStatus: _ton_core.AccountStatus;
            inMessage: {
                info: {
                    type: "internal";
                    ihrDisabled: boolean;
                    bounce: boolean;
                    bounced: boolean;
                    src: string | null;
                    dest: string | null;
                    value: {
                        coins: string;
                        other: {
                            id: number;
                            amount: string;
                        }[] | undefined;
                    };
                    ihrFee: string;
                    forwardFee: string;
                    createdLt: string;
                    createdAt: number;
                    importFee?: undefined;
                } | {
                    type: "external-in";
                    src: string | null;
                    dest: string | null;
                    importFee: string;
                    ihrDisabled?: undefined;
                    bounce?: undefined;
                    bounced?: undefined;
                    value?: undefined;
                    ihrFee?: undefined;
                    forwardFee?: undefined;
                    createdLt?: undefined;
                    createdAt?: undefined;
                } | {
                    type: "external-out";
                    src: string | null;
                    dest: string | null;
                    createdLt: string;
                    createdAt: number;
                    ihrDisabled?: undefined;
                    bounce?: undefined;
                    bounced?: undefined;
                    value?: undefined;
                    ihrFee?: undefined;
                    forwardFee?: undefined;
                    importFee?: undefined;
                };
                init: {
                    splitDepth: number | null;
                    special: _ton_core.TickTock | null;
                    code: {
                        boc?: string | undefined;
                        hash: string;
                        bits: number;
                        refs: number;
                        isExotic: boolean;
                    } | null;
                    data: {
                        boc?: string | undefined;
                        hash: string;
                        bits: number;
                        refs: number;
                        isExotic: boolean;
                    } | null;
                    librariesCount: number;
                } | null;
                body: {
                    boc?: string | undefined;
                    hash: string;
                    bits: number;
                    refs: number;
                    isExotic: boolean;
                };
            } | null;
            outMessages: {
                key: number;
                message: {
                    info: {
                        type: "internal";
                        ihrDisabled: boolean;
                        bounce: boolean;
                        bounced: boolean;
                        src: string | null;
                        dest: string | null;
                        value: {
                            coins: string;
                            other: {
                                id: number;
                                amount: string;
                            }[] | undefined;
                        };
                        ihrFee: string;
                        forwardFee: string;
                        createdLt: string;
                        createdAt: number;
                        importFee?: undefined;
                    } | {
                        type: "external-in";
                        src: string | null;
                        dest: string | null;
                        importFee: string;
                        ihrDisabled?: undefined;
                        bounce?: undefined;
                        bounced?: undefined;
                        value?: undefined;
                        ihrFee?: undefined;
                        forwardFee?: undefined;
                        createdLt?: undefined;
                        createdAt?: undefined;
                    } | {
                        type: "external-out";
                        src: string | null;
                        dest: string | null;
                        createdLt: string;
                        createdAt: number;
                        ihrDisabled?: undefined;
                        bounce?: undefined;
                        bounced?: undefined;
                        value?: undefined;
                        ihrFee?: undefined;
                        forwardFee?: undefined;
                        importFee?: undefined;
                    };
                    init: {
                        splitDepth: number | null;
                        special: _ton_core.TickTock | null;
                        code: {
                            boc?: string | undefined;
                            hash: string;
                            bits: number;
                            refs: number;
                            isExotic: boolean;
                        } | null;
                        data: {
                            boc?: string | undefined;
                            hash: string;
                            bits: number;
                            refs: number;
                            isExotic: boolean;
                        } | null;
                        librariesCount: number;
                    } | null;
                    body: {
                        boc?: string | undefined;
                        hash: string;
                        bits: number;
                        refs: number;
                        isExotic: boolean;
                    };
                };
            }[] | undefined;
            totalFees: {
                coins: string;
                other: {
                    id: number;
                    amount: string;
                }[] | undefined;
            };
            description: {
                type: "generic";
                aborted: boolean;
                destroyed: boolean;
                isTock?: undefined;
                installed?: undefined;
            } | {
                type: "tick-tock";
                isTock: boolean;
                aborted: boolean;
                destroyed: boolean;
                installed?: undefined;
            } | {
                type: "split-install";
                installed: boolean;
                aborted?: undefined;
                destroyed?: undefined;
                isTock?: undefined;
            } | {
                type: "merge-prepare";
                aborted: boolean;
                destroyed?: undefined;
                isTock?: undefined;
                installed?: undefined;
            } | {
                type: "merge-install";
                aborted: boolean;
                destroyed: boolean;
                isTock?: undefined;
                installed?: undefined;
            } | {
                type: "storage" | "split-prepare";
                aborted?: undefined;
                destroyed?: undefined;
                isTock?: undefined;
                installed?: undefined;
            };
            hash: string;
        };
    }>;
    tonDecodeStateInitBoc: ai.Tool<{
        boc: string;
        workchain?: number | undefined;
        includeCodeBoc?: boolean | undefined;
        includeDataBoc?: boolean | undefined;
    }, {
        cellCount: number;
        address: string | null;
        stateInit: {
            splitDepth: number | null;
            special: _ton_core.TickTock | null;
            code: {
                boc?: string | undefined;
                hash: string;
                bits: number;
                refs: number;
                isExotic: boolean;
            } | null;
            data: {
                boc?: string | undefined;
                hash: string;
                bits: number;
                refs: number;
                isExotic: boolean;
            } | null;
            librariesCount: number;
        } | null;
    }>;
    tonComputeAddressFromStateInit: ai.Tool<{
        boc: string;
        workchain: number;
    }, {
        address: string | null;
    }>;
    tonDecodeMessageApi: ai.Tool<{
        boc: string;
    }, _ton_api_client.DecodedMessage>;
    tonEmulateMessageToEvent: ai.Tool<{
        boc: string;
        ignoreSignatureCheck?: boolean | undefined;
    }, _ton_api_client.Event>;
    tonEmulateMessageToTrace: ai.Tool<{
        boc: string;
        ignoreSignatureCheck?: boolean | undefined;
    }, _ton_api_client.Trace>;
    tonEmulateMessageToWallet: ai.Tool<{
        boc: string;
        params?: {
            address: string;
            balance?: string | number | undefined;
        }[] | undefined;
    }, _ton_api_client.MessageConsequences>;
    tonEmulateMessageToAccountEvent: ai.Tool<{
        address: string;
        boc: string;
        ignoreSignatureCheck?: boolean | undefined;
    }, _ton_api_client.AccountEvent>;
    tonGetAccountInscriptions: ai.Tool<{
        address: string;
        limit: number;
        offset: number;
    }, _ton_api_client.InscriptionBalances>;
    tonGetAccountInscriptionsHistory: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetAccountInscriptionsHistoryByTicker: ai.Tool<{
        address: string;
        ticker: string;
        limit: number;
        beforeLt?: string | number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetInscriptionOpTemplate: ai.Tool<{
        type: "ton20" | "gram20";
        operation: "transfer";
        amount: string | number;
        ticker: string;
        who: string;
        destination?: string | undefined;
        comment?: string | undefined;
    }, _ton_api_client.GetInscriptionOpTemplateData>;
    tonGetEvent: ai.Tool<{
        eventId: string;
    }, _ton_api_client.Event>;
    tonGetTrace: ai.Tool<{
        traceId: string;
    }, _ton_api_client.Trace>;
    tonGetStorageProviders: ai.Tool<Record<string, never>, _ton_api_client.GetStorageProvidersData>;
    tonGetStakingPools: ai.Tool<{
        availableFor?: string | undefined;
        includeUnverified?: boolean | undefined;
    }, _ton_api_client.GetStakingPoolsData>;
    tonGetStakingPoolInfo: ai.Tool<{
        address: string;
    }, _ton_api_client.GetStakingPoolInfoData>;
    tonGetStakingPoolHistory: ai.Tool<{
        address: string;
    }, _ton_api_client.GetStakingPoolHistoryData>;
    tonGetAccountNominatorPools: ai.Tool<{
        address: string;
    }, _ton_api_client.AccountStaking>;
    tonTonConnectProof: ai.Tool<{
        address: string;
        proof: {
            timestamp: number;
            domain: {
                value: string;
                lengthBytes?: number | undefined;
            };
            signature: string;
            payload: string;
            stateInit?: string | undefined;
        };
    }, _ton_api_client.TonConnectProofData>;
    tonGetAccountSeqno: ai.Tool<{
        address: string;
    }, _ton_api_client.Seqno>;
    tonGetWalletsByPublicKey: ai.Tool<{
        publicKey: string;
    }, _ton_api_client.Accounts>;
    tonGetTonConnectPayload: ai.Tool<Record<string, never>, _ton_api_client.GetTonConnectPayloadData>;
    tonGetAccountInfoByStateInit: ai.Tool<{
        stateInit: string;
    }, _ton_api_client.AccountInfoByStateInit>;
    tonGetRates: ai.Tool<{
        tokens: string[];
        currencies: string[];
    }, _ton_api_client.GetRatesData>;
    tonGetChartRates: ai.Tool<{
        token: string;
        currency?: string | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
        pointsCount?: number | undefined;
    }, _ton_api_client.GetChartRatesData>;
    tonGetMarketsRates: ai.Tool<Record<string, never>, _ton_api_client.GetMarketsRatesData>;
    tonResolveDns: ai.Tool<{
        domain: string;
    }, _ton_api_client.DnsRecord>;
    tonGetDnsInfo: ai.Tool<{
        domain: string;
    }, _ton_api_client.DomainInfo>;
    tonGetDnsBids: ai.Tool<{
        domain: string;
    }, _ton_api_client.DomainBids>;
    tonGetDnsAuctions: ai.Tool<{
        tld?: string | undefined;
    }, _ton_api_client.Auctions>;
    tonGetNftCollections: ai.Tool<{
        limit: number;
        offset: number;
    }, _ton_api_client.NftCollections>;
    tonGetNftCollection: ai.Tool<{
        address: string;
    }, _ton_api_client.NftCollection>;
    tonGetNftCollectionItems: ai.Tool<{
        collectionAddress: string;
        limit: number;
        offset: number;
    }, _ton_api_client.NftItems>;
    tonGetNftItemsBulk: ai.Tool<{
        addresses: string[];
    }, _ton_api_client.NftItems>;
    tonGetNftCollectionItemsBulk: ai.Tool<{
        addresses: string[];
    }, _ton_api_client.NftCollections>;
    tonGetNftItem: ai.Tool<{
        address: string;
    }, _ton_api_client.NftItem>;
    tonGetNftHistoryById: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetJettons: ai.Tool<{
        limit: number;
        offset: number;
    }, _ton_api_client.Jettons>;
    tonGetJettonInfo: ai.Tool<{
        address: string;
    }, _ton_api_client.JettonInfo>;
    tonGetJettonInfosBulk: ai.Tool<{
        addresses: string[];
    }, _ton_api_client.Jettons>;
    tonGetJettonHolders: ai.Tool<{
        address: string;
        limit: number;
        offset: number;
    }, _ton_api_client.JettonHolders>;
    tonGetJettonTransferPayload: ai.Tool<{
        address: string;
        jettonAddress: string;
    }, _ton_api_client.JettonTransferPayload>;
    tonGetJettonsEvent: ai.Tool<{
        eventId: string;
    }, _ton_api_client.Event>;
    tonGetAccount: ai.Tool<{
        address: string;
    }, _ton_api_client.Account>;
    tonGetAccountsBulk: ai.Tool<{
        addresses: string[];
        currency?: string | undefined;
    }, _ton_api_client.Accounts>;
    tonGetAccountPublicKey: ai.Tool<{
        address: string;
    }, _ton_api_client.GetAccountPublicKeyData>;
    tonReindexAccount: ai.Tool<{
        address: string;
    }, any>;
    tonGetAccountDomains: ai.Tool<{
        address: string;
    }, _ton_api_client.DomainNames>;
    tonGetAccountDnsExpiring: ai.Tool<{
        address: string;
        period?: number | undefined;
    }, _ton_api_client.DnsExpiring>;
    tonSearchAccounts: ai.Tool<{
        name: string;
    }, _ton_api_client.FoundAccounts>;
    tonGetAccountEvents: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
        initiator?: boolean | undefined;
        subjectOnly?: boolean | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetAccountEvent: ai.Tool<{
        address: string;
        eventId: string;
        subjectOnly?: boolean | undefined;
    }, _ton_api_client.AccountEvent>;
    tonGetAccountTraces: ai.Tool<{
        address: string;
        beforeLt?: string | number | undefined;
        limit?: number | undefined;
    }, _ton_api_client.TraceIDs>;
    tonGetAccountSubscriptions: ai.Tool<{
        address: string;
    }, _ton_api_client.Subscriptions>;
    tonGetAccountMultisigs: ai.Tool<{
        address: string;
    }, _ton_api_client.Multisigs>;
    tonGetAccountDiff: ai.Tool<{
        address: string;
        startDate: number;
        endDate: number;
    }, _ton_api_client.GetAccountDiffData>;
    tonGetAccountExtraCurrencyHistory: ai.Tool<{
        address: string;
        currencyId: number;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetAccountTransactions: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
        afterLt?: string | number | undefined;
        sortOrder?: "asc" | "desc" | undefined;
    }, _ton_api_client.Transactions>;
    tonGetAccountJettons: ai.Tool<{
        address: string;
        currencies?: string[] | undefined;
        supportedExtensions?: string[] | undefined;
    }, _ton_api_client.JettonsBalances>;
    tonGetAccountJettonBalance: ai.Tool<{
        address: string;
        jettonAddress: string;
        currencies?: string[] | undefined;
        supportedExtensions?: string[] | undefined;
    }, _ton_api_client.JettonBalance>;
    tonGetAccountJettonsHistory: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetAccountJettonHistory: ai.Tool<{
        address: string;
        jettonAddress: string;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
    }, _ton_api_client.AccountEvents>;
    tonGetAccountNfts: ai.Tool<{
        address: string;
        limit: number;
        offset: number;
        collection?: string | undefined;
        indirectOwnership?: boolean | undefined;
    }, _ton_api_client.NftItems>;
    tonGetAccountNftHistory: ai.Tool<{
        address: string;
        limit: number;
        beforeLt?: string | number | undefined;
        startDate?: number | undefined;
        endDate?: number | undefined;
    }, _ton_api_client.AccountEvents>;
};
type TonToolset = ReturnType<typeof createTonTools>;

export { type TonToolsOptions, type TonToolset, createTonTools };
