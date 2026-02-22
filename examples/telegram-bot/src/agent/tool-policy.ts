import { createTonTools } from "@mhbdev/ai-sdk-ton-tools";
import type { ToolSet } from "ai";
import type { ChatType, TonNetwork } from "@/types/contracts";

const EXECUTE_TIMEOUT_MS = 20_000;
const READ_CACHE_TTL_MS = 30_000;

const CRITICAL_WRITE_TOOLS = new Set([
  "tonSendBlockchainMessage",
  "tonSendBlockchainMessageBatch",
  "tonBuildAndSendExternalMessage",
]);

const SECRET_DISABLED_TOOLS = new Set([
  "tonGenerateWalletMnemonic",
  "tonMnemonicToWalletKeys",
  "tonSignData",
  "tonSafeSignCellBoc",
]);

const ADVANCED_COMPUTE_TOOLS = new Set([
  "tonBuildCellBoc",
  "tonSliceRunOperations",
  "tonParseCellTree",
  "tonDecodeMessageBoc",
  "tonDecodeTransactionBoc",
  "tonDecodeStateInitBoc",
  "tonDecodeMessageApi",
  "tonEmulateMessageToEvent",
  "tonEmulateMessageToTrace",
  "tonEmulateMessageToWallet",
  "tonEmulateMessageToAccountEvent",
]);

const NON_READONLY_TOOLS = new Set([
  ...CRITICAL_WRITE_TOOLS,
  "tonBuildExternalMessageBoc",
  "tonBuildCellBoc",
  "tonSliceRunOperations",
  "tonParseCellTree",
  "tonTonConnectProof",
  ...SECRET_DISABLED_TOOLS,
]);

const readCache = new Map<string, { value: unknown; expiresAt: number }>();

const createCacheKey = (toolName: string, input: unknown) =>
  `${toolName}:${JSON.stringify(input)}`;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Tool timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);

const shouldForceApprovalForAdvancedTool = (input: unknown) => {
  if (!input || typeof input !== "object") {
    return false;
  }
  const encoded = JSON.stringify(input);
  return encoded.length > 6_000;
};

const wrapToolExecute = (
  toolName: string,
  toolDefinition: any,
  useCache: boolean,
) => {
  const execute = toolDefinition.execute;
  if (!execute) {
    return execute;
  }

  return async (input: unknown, options: unknown) => {
    const cacheKey = createCacheKey(toolName, input);
    const now = Date.now();
    if (useCache) {
      const cached = readCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.value;
      }
    }

    const result = await withTimeout(
      execute(input as never, options as never),
      EXECUTE_TIMEOUT_MS,
    );

    if (useCache) {
      readCache.set(cacheKey, {
        value: result,
        expiresAt: now + READ_CACHE_TTL_MS,
      });
    }

    return result;
  };
};

const setNeedsApproval = (toolName: string, toolDefinition: any) => {
  if (CRITICAL_WRITE_TOOLS.has(toolName) || toolName === "tonTonConnectProof") {
    return {
      ...toolDefinition,
      needsApproval: true,
    };
  }

  if (ADVANCED_COMPUTE_TOOLS.has(toolName)) {
    return {
      ...toolDefinition,
      needsApproval: async (input: unknown) =>
        shouldForceApprovalForAdvancedTool(input),
    };
  }

  return toolDefinition;
};

export const buildPolicyWrappedTonTools = (input: {
  apiKey: string;
  network: TonNetwork;
  chatType: ChatType;
}) => {
  const rawTools = createTonTools({
    apiKey: input.apiKey,
    network: input.network,
  }) as Record<string, any>;

  const dnsByAddressSource = rawTools.tonGetAccountDomains;
  if (dnsByAddressSource) {
    rawTools.tonFindAddressDnsItems = {
      ...dnsByAddressSource,
      description:
        "Find DNS items/domains for a TON address. Use when the user provides a wallet/account address and asks for DNS records.",
    };
  }

  const policyTools: Record<string, any> = {};
  for (const [name, definition] of Object.entries(rawTools)) {
    if (SECRET_DISABLED_TOOLS.has(name)) {
      continue;
    }

    if (input.chatType !== "private" && NON_READONLY_TOOLS.has(name)) {
      continue;
    }

    const cacheable = !CRITICAL_WRITE_TOOLS.has(name) && !ADVANCED_COMPUTE_TOOLS.has(name);
    const withApproval = setNeedsApproval(name, definition);
    const wrappedExecute = wrapToolExecute(name, withApproval, cacheable);
    policyTools[name] = wrappedExecute
      ? {
          ...withApproval,
          execute: wrappedExecute,
        }
      : withApproval;
  }

  return policyTools as ToolSet;
};
