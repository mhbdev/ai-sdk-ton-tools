import { randomBytes } from "node:crypto";
import { setMaxListeners } from "node:events";
import TonConnect, {
  CHAIN,
  toUserFriendlyAddress,
  type IStorage,
  type Wallet,
} from "@tonconnect/sdk";
import { createTonTools } from "@mhbdev/ai-sdk-ton-tools";
import { getEnv } from "@/config/env";
import {
  getActiveWallet,
  getSessionById,
  linkWallet,
  updateSessionState,
} from "@/db/queries";
import { logger } from "@/observability/logger";
import { redis } from "@/queue/connection";
import { sendTelegramText } from "@/telegram/bot";
import type { TonNetwork } from "@/types/contracts";
import { hashProofPayload } from "@/approvals/service";

type TonConnectProofPayload = {
  address: string;
  proof: {
    timestamp: number;
    domain: {
      lengthBytes?: number;
      value: string;
    };
    signature: string;
    payload: string;
    stateInit?: string;
  };
  publicKey?: string;
  walletAppName?: string;
};

type PendingWalletConnectSession = {
  sessionId: string;
  telegramChatId: string;
  telegramUserId: string;
  messageThreadId?: number;
  network: TonNetwork;
  nonce: string;
  expiresAtMs: number;
  connector: TonConnect;
  connectUrl: string | null;
  connectAbortController: AbortController;
  unsubscribe: () => void;
  expiryTimer: NodeJS.Timeout;
  finalized: boolean;
  closing: boolean;
  finalizePromise: Promise<void> | null;
};

export type WalletConnectFlowStatus = {
  status: "connected" | "pending" | "expired" | "cancelled" | "none" | "failed";
  message: string;
  connectUrl?: string;
};

const WALLET_CONNECT_TTL_MS = 10 * 60 * 1000;
const WALLET_CONNECT_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;
const WALLET_CONNECT_OPENING_DEADLINE_MS = 2 * 60 * 1000;
const TONCONNECT_MANIFEST_CHECK_TIMEOUT_MS = 10_000;
const TONCONNECT_MANIFEST_CHECK_OK_CACHE_MS = 5 * 60 * 1000;
const TONCONNECT_MANIFEST_CHECK_FAIL_CACHE_MS = 30_000;
const DEFAULT_BRIDGE_URL = "https://bridge.tonapi.io/bridge";
const FALLBACK_BRIDGE_URL = "https://bridge.tonhubapi.com/bridge";
const DEFAULT_TONCONNECT_SOURCES: Array<{ bridgeUrl: string }> = [
  { bridgeUrl: DEFAULT_BRIDGE_URL },
  { bridgeUrl: FALLBACK_BRIDGE_URL },
];

const pendingWalletConnectSessions = new Map<string, PendingWalletConnectSession>();
const tonConnectStorageFallback = new Map<string, string>();
const tonConnectManifestHealthCache = new Map<
  string,
  { ok: boolean; checkedAt: number; error?: string }
>();

const asErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const assertTonConnectManifestReachable = async (manifestUrl: string) => {
  const now = Date.now();
  const cached = tonConnectManifestHealthCache.get(manifestUrl);
  if (cached) {
    const cacheTtl = cached.ok
      ? TONCONNECT_MANIFEST_CHECK_OK_CACHE_MS
      : TONCONNECT_MANIFEST_CHECK_FAIL_CACHE_MS;
    if (now - cached.checkedAt < cacheTtl) {
      if (cached.ok) {
        return;
      }
      throw new Error(
        cached.error ??
          "TonConnect manifest URL check failed recently. Please retry in a moment.",
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TONCONNECT_MANIFEST_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(manifestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
    });

    if (!response.ok) {
      const message = `TonConnect manifest URL returned HTTP ${response.status}.`;
      tonConnectManifestHealthCache.set(manifestUrl, {
        ok: false,
        checkedAt: Date.now(),
        error: message,
      });
      throw new Error(message);
    }

    tonConnectManifestHealthCache.set(manifestUrl, {
      ok: true,
      checkedAt: Date.now(),
    });
  } catch (error) {
    if (!tonConnectManifestHealthCache.has(manifestUrl)) {
      tonConnectManifestHealthCache.set(manifestUrl, {
        ok: false,
        checkedAt: Date.now(),
        error: asErrorMessage(error),
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const buildWalletConnectFailureMessage = (
  error: unknown,
  phase: "initialization" | "status",
) => {
  const message = asErrorMessage(error).toLowerCase();

  if (message.includes("manifest")) {
    return "TonConnect manifest URL is not reachable. Please ask support to fix TONCONNECT_MANIFEST_URL and retry.";
  }
  if (message.includes("already connected")) {
    return "A stale wallet connection session was detected. Run /wallet cancel, then /wallet connect again.";
  }
  if (message.includes("reject")) {
    return "Wallet connection request was rejected in your wallet app. Run /wallet connect to try again.";
  }
  if (
    message.includes("bridge") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("abort")
  ) {
    return "Unable to establish secure wallet bridge connection right now. Please try again in a moment.";
  }

  return phase === "initialization"
    ? "Failed to initialize wallet connection. Please try again in a moment."
    : "Wallet connection failed. Run /wallet connect to start a new attempt.";
};

const isTerminalWalletConnectStatusError = (error: unknown) => {
  const message = asErrorMessage(error).toLowerCase();
  return (
    message.includes("manifest") ||
    message.includes("already connected") ||
    message.includes("reject") ||
    message.includes("bridge") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("abort")
  );
};

class RedisTonConnectStorage implements IStorage {
  constructor(private readonly prefix: string) {}

  private keyFor(key: string) {
    return `${this.prefix}:${key}`;
  }

  async setItem(key: string, value: string): Promise<void> {
    const storageKey = this.keyFor(key);
    tonConnectStorageFallback.set(storageKey, value);

    try {
      await redis.set(
        storageKey,
        value,
        "PX",
        WALLET_CONNECT_STORAGE_TTL_MS,
      );
    } catch (error) {
      logger.warn("TonConnect storage set failed; using in-memory fallback.", {
        error: asErrorMessage(error),
      });
    }
  }

  async getItem(key: string): Promise<string | null> {
    const storageKey = this.keyFor(key);
    try {
      const value = await redis.get(storageKey);
      if (typeof value === "string") {
        tonConnectStorageFallback.set(storageKey, value);
      }
      return value;
    } catch (error) {
      logger.warn("TonConnect storage get failed; using in-memory fallback.", {
        error: asErrorMessage(error),
      });
      return tonConnectStorageFallback.get(storageKey) ?? null;
    }
  }

  async removeItem(key: string): Promise<void> {
    const storageKey = this.keyFor(key);
    tonConnectStorageFallback.delete(storageKey);

    try {
      await redis.del(storageKey);
    } catch (error) {
      logger.warn("TonConnect storage delete failed; continuing cleanup.", {
        error: asErrorMessage(error),
      });
    }
  }
}

const createWalletTools = () =>
  createTonTools({
    apiKey: getEnv().TONAPI_API_KEY,
    network: "mainnet",
  });

const parseSessionState = (stateJson: unknown): Record<string, unknown> => {
  if (!stateJson || typeof stateJson !== "object" || Array.isArray(stateJson)) {
    return {};
  }
  return stateJson as Record<string, unknown>;
};

const patchSessionState = async (
  sessionId: string,
  patch: Record<string, unknown>,
) => {
  const session = await getSessionById(sessionId);
  if (!session) {
    return;
  }

  const previousState = parseSessionState(session.stateJson);
  await updateSessionState(sessionId, {
    ...previousState,
    ...patch,
  });
};

const formatWalletAddress = (rawAddress: string, network: TonNetwork) =>
  toUserFriendlyAddress(rawAddress, network === "testnet");

const buildProofPayloadFromWallet = (wallet: Wallet): TonConnectProofPayload | null => {
  const proofItem = wallet.connectItems?.tonProof;
  if (!proofItem || !("proof" in proofItem)) {
    return null;
  }

  return {
    address: wallet.account.address,
    proof: {
      timestamp: proofItem.proof.timestamp,
      domain: {
        lengthBytes: proofItem.proof.domain.lengthBytes,
        value: proofItem.proof.domain.value,
      },
      payload: proofItem.proof.payload,
      signature: proofItem.proof.signature,
      stateInit: wallet.account.walletStateInit,
    },
    ...(wallet.account.publicKey ? { publicKey: wallet.account.publicKey } : {}),
    ...(wallet.device.appName ? { walletAppName: wallet.device.appName } : {}),
  };
};

const cleanupPendingWalletConnectSession = async (
  sessionId: string,
  options?: {
    disconnect?: boolean;
  },
) => {
  const pending = pendingWalletConnectSessions.get(sessionId);
  if (!pending) {
    return;
  }

  pendingWalletConnectSessions.delete(sessionId);
  clearTimeout(pending.expiryTimer);
  pending.unsubscribe();
  pending.connectAbortController.abort();

  try {
    pending.connector.pauseConnection();
  } catch {
    // Best-effort cleanup.
  }

  if (options?.disconnect && pending.connector.connected) {
    await pending.connector.disconnect().catch(() => undefined);
  }
};

const failAndCloseWalletConnectSession = async (
  pending: PendingWalletConnectSession,
  message: string,
  error?: unknown,
) => {
  if (pending.closing) {
    return;
  }
  pending.closing = true;

  await patchSessionState(pending.sessionId, {
    tonConnectStatus: "failed",
    tonConnectLastError:
      error
        ? buildWalletConnectFailureMessage(error, "status")
        : (typeof message === "string" && message.length > 0 ? message : null),
    tonConnectNonce: null,
    tonConnectNonceIssuedAt: null,
    tonConnectNonceExpiresAt: null,
    tonConnectConnectUrl: null,
  });
  await sendTelegramText(pending.telegramChatId, message, {
    ...(typeof pending.messageThreadId === "number"
      ? { messageThreadId: pending.messageThreadId }
      : {}),
  });
  await cleanupPendingWalletConnectSession(pending.sessionId, {
    disconnect: true,
  });
};

const finalizeWalletConnectSession = async (pending: PendingWalletConnectSession) => {
  if (pending.finalized || pending.closing) {
    return;
  }

  const wallet = pending.connector.wallet;
  if (!wallet) {
    return;
  }

  const proofPayload = buildProofPayloadFromWallet(wallet);
  if (!proofPayload) {
    await failAndCloseWalletConnectSession(
      pending,
      "Wallet connected but did not return ton_proof. Please reconnect using a TonConnect-compatible wallet and try again.",
    );
    return;
  }

  if (proofPayload.proof.payload !== pending.nonce) {
    await failAndCloseWalletConnectSession(
      pending,
      "Wallet proof payload did not match the pending connect request. Please run /wallet connect again.",
    );
    return;
  }

  try {
    await verifyTonConnectProof({
      telegramUserId: pending.telegramUserId,
      payload: proofPayload,
      expectedPayload: pending.nonce,
    });

    const formattedAddress = formatWalletAddress(wallet.account.address, pending.network);
    pending.finalized = true;
    await patchSessionState(pending.sessionId, {
      tonConnectStatus: "connected",
      tonConnectWalletAddress: formattedAddress,
      tonConnectWalletApp: wallet.device.appName,
      tonConnectLinkedAt: new Date().toISOString(),
      tonConnectLastError: null,
      tonConnectNonce: null,
      tonConnectNonceIssuedAt: null,
      tonConnectNonceExpiresAt: null,
      tonConnectConnectUrl: null,
    });
    await sendTelegramText(
      pending.telegramChatId,
      `Wallet connected: ${formattedAddress}${wallet.device.appName ? ` (${wallet.device.appName})` : ""}`,
      {
        ...(typeof pending.messageThreadId === "number"
          ? { messageThreadId: pending.messageThreadId }
          : {}),
      },
    );

    await cleanupPendingWalletConnectSession(pending.sessionId);
  } catch (error) {
    await failAndCloseWalletConnectSession(
      pending,
      "Wallet proof verification failed. Please reconnect and try again.",
      error,
    );
  }
};

const refreshPendingWalletConnectSession = async (sessionId: string) => {
  const pending = pendingWalletConnectSessions.get(sessionId);
  if (!pending || pending.closing) {
    return;
  }

  if (pending.finalizePromise) {
    await pending.finalizePromise;
    return;
  }

  pending.finalizePromise = finalizeWalletConnectSession(pending).finally(() => {
    pending.finalizePromise = null;
  });
  await pending.finalizePromise;
};

export const createTonConnectNonce = () => randomBytes(16).toString("hex");

export const beginWalletConnectFlow = async (input: {
  sessionId: string;
  telegramChatId: string;
  telegramUserId: string;
  messageThreadId?: number;
  network: TonNetwork;
  correlationId: string;
}) => {
  await cleanupPendingWalletConnectSession(input.sessionId, {
    disconnect: true,
  });

  const env = getEnv();
  await assertTonConnectManifestReachable(env.TONCONNECT_MANIFEST_URL);
  const nonce = createTonConnectNonce();
  const expiresAtMs = Date.now() + WALLET_CONNECT_TTL_MS;
  const connectAbortController = new AbortController();
  setMaxListeners(0, connectAbortController.signal);
  const connector = new TonConnect({
    manifestUrl: env.TONCONNECT_MANIFEST_URL,
    storage: new RedisTonConnectStorage(
      `telegram-bot:tonconnect:${input.sessionId}:${nonce}`,
    ),
    analytics: {
      mode: "off",
    },
  });

  connector.setConnectionNetwork(
    input.network === "testnet" ? CHAIN.TESTNET : CHAIN.MAINNET,
  );

  const expiryTimer = setTimeout(() => {
    void expireWalletConnectFlow({
      sessionId: input.sessionId,
      telegramUserId: input.telegramUserId,
    });
  }, WALLET_CONNECT_TTL_MS);

  const pending: PendingWalletConnectSession = {
    sessionId: input.sessionId,
    telegramChatId: input.telegramChatId,
    telegramUserId: input.telegramUserId,
    ...(typeof input.messageThreadId === "number"
      ? { messageThreadId: input.messageThreadId }
      : {}),
    network: input.network,
    nonce,
    expiresAtMs,
    connector,
    connectUrl: null,
    connectAbortController,
    unsubscribe: () => undefined,
    expiryTimer,
    finalized: false,
    closing: false,
    finalizePromise: null,
  };

  pending.unsubscribe = connector.onStatusChange(
    () => {
      void refreshPendingWalletConnectSession(input.sessionId);
    },
    (error) => {
      logger.warn("TonConnect status error.", {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        error: error.message,
      });

      const active = pendingWalletConnectSessions.get(input.sessionId);
      if (!active || active !== pending || pending.closing) {
        return;
      }

      if (isTerminalWalletConnectStatusError(error)) {
        void failAndCloseWalletConnectSession(
          pending,
          buildWalletConnectFailureMessage(error, "status"),
          error,
        );
        return;
      }

      void patchSessionState(input.sessionId, {
        tonConnectLastError: buildWalletConnectFailureMessage(error, "status"),
      }).catch(() => undefined);
    },
  );

  pendingWalletConnectSessions.set(input.sessionId, pending);

  let connectUrl = "";
  try {
    const generatedLink = connector.connect(DEFAULT_TONCONNECT_SOURCES, {
      request: {
        tonProof: nonce,
      },
      openingDeadlineMS: WALLET_CONNECT_OPENING_DEADLINE_MS,
      signal: connectAbortController.signal,
    });
    if (typeof generatedLink !== "string" || generatedLink.length === 0) {
      throw new Error("TonConnect did not return a universal connection link.");
    }
    connectUrl = generatedLink;
    pending.connectUrl = connectUrl;

    await patchSessionState(input.sessionId, {
      tonConnectStatus: "pending",
      tonConnectNonce: nonce,
      tonConnectNonceIssuedAt: new Date().toISOString(),
      tonConnectNonceExpiresAt: new Date(expiresAtMs).toISOString(),
      tonConnectConnectUrl: connectUrl,
      tonConnectCorrelationId: input.correlationId,
      tonConnectLastError: null,
    });
  } catch (error) {
    const message = buildWalletConnectFailureMessage(error, "initialization");
    logger.error("Failed to initialize wallet connect flow.", {
      correlationId: input.correlationId,
      sessionId: input.sessionId,
      error: error instanceof Error ? error.message : String(error),
      userMessage: message,
    });
    await cleanupPendingWalletConnectSession(input.sessionId, {
      disconnect: true,
    });
    await patchSessionState(input.sessionId, {
      tonConnectStatus: "failed",
      tonConnectLastError: message,
      tonConnectNonce: null,
      tonConnectNonceIssuedAt: null,
      tonConnectNonceExpiresAt: null,
      tonConnectConnectUrl: null,
    });
    throw new Error(message);
  }

  return {
    connectUrl,
    nonce,
    expiresAt: new Date(expiresAtMs),
  };
};

export const getWalletConnectFlowStatus = async (input: {
  sessionId: string;
  telegramUserId: string;
  telegramChatId?: string;
}): Promise<WalletConnectFlowStatus> => {
  const session = await getSessionById(input.sessionId);
  if (
    !session ||
    session.telegramUserId !== input.telegramUserId ||
    (typeof input.telegramChatId === "string" &&
      session.telegramChatId !== input.telegramChatId)
  ) {
    return {
      status: "none",
      message: "Wallet status is unavailable for this session.",
    };
  }

  const pending = pendingWalletConnectSessions.get(input.sessionId);
  if (pending && pending.telegramUserId === input.telegramUserId) {
    if (Date.now() > pending.expiresAtMs) {
      await expireWalletConnectFlow({
        sessionId: input.sessionId,
        telegramUserId: input.telegramUserId,
      });
      return {
        status: "expired",
        message: "Wallet connect request expired. Run /wallet connect again.",
      };
    }

    await refreshPendingWalletConnectSession(input.sessionId);
  }

  const activeWallet = await getActiveWallet(input.telegramUserId);
  if (activeWallet) {
    return {
      status: "connected",
      message: `Wallet connected: ${activeWallet.address}`,
    };
  }

  const state = parseSessionState(session.stateJson);
  const status = state.tonConnectStatus;
  if (status === "pending") {
    const expiresAtValue = state.tonConnectNonceExpiresAt;
    const expiresAtMs =
      typeof expiresAtValue === "string"
        ? Date.parse(expiresAtValue)
        : Number.NaN;
    const remainingSeconds = Number.isFinite(expiresAtMs)
      ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
      : 0;
    const stateConnectUrl =
      typeof state.tonConnectConnectUrl === "string" &&
      state.tonConnectConnectUrl.length > 0
        ? state.tonConnectConnectUrl
        : undefined;
    const connectUrl =
      typeof pending?.connectUrl === "string" && pending.connectUrl.length > 0
        ? pending.connectUrl
        : stateConnectUrl;

    return {
      status: "pending",
      message:
        remainingSeconds > 0
          ? `Still waiting for wallet approval (${remainingSeconds}s remaining).`
          : "Still waiting for wallet approval. You can run /wallet connect again.",
      ...(typeof connectUrl === "string" ? { connectUrl } : {}),
    };
  }

  if (status === "failed") {
    const lastError = state.tonConnectLastError;
    return {
      status: "failed",
      message:
        typeof lastError === "string" && lastError.length > 0
          ? `Last wallet connect attempt failed: ${lastError}`
          : "Last wallet connect attempt failed. Run /wallet connect again.",
    };
  }

  if (status === "cancelled") {
    return {
      status: "cancelled",
      message: "Wallet connect request was cancelled. Run /wallet connect to start again.",
    };
  }

  return {
    status: "none",
    message: "No wallet is connected. Run /wallet connect.",
  };
};

export const cancelWalletConnectFlow = async (input: {
  sessionId: string;
  telegramUserId: string;
  telegramChatId?: string;
}) => {
  const session = await getSessionById(input.sessionId);
  if (
    !session ||
    session.telegramUserId !== input.telegramUserId ||
    (typeof input.telegramChatId === "string" &&
      session.telegramChatId !== input.telegramChatId)
  ) {
    return {
      ok: false,
      message: "Wallet connect request not found for this user.",
    };
  }

  await cleanupPendingWalletConnectSession(input.sessionId, {
    disconnect: true,
  });
  await patchSessionState(input.sessionId, {
    tonConnectStatus: "cancelled",
    tonConnectNonce: null,
    tonConnectNonceIssuedAt: null,
    tonConnectNonceExpiresAt: null,
    tonConnectConnectUrl: null,
  });

  return {
    ok: true,
    message: "Wallet connect request cancelled.",
  };
};

export const expireWalletConnectFlow = async (input: {
  sessionId: string;
  telegramUserId: string;
}) => {
  const session = await getSessionById(input.sessionId);
  if (!session || session.telegramUserId !== input.telegramUserId) {
    return;
  }

  const pending = pendingWalletConnectSessions.get(input.sessionId);
  if (!pending) {
    return;
  }

  await cleanupPendingWalletConnectSession(input.sessionId, {
    disconnect: true,
  });
  await patchSessionState(input.sessionId, {
    tonConnectStatus: "expired",
    tonConnectNonce: null,
    tonConnectNonceIssuedAt: null,
    tonConnectNonceExpiresAt: null,
    tonConnectConnectUrl: null,
  });
  await sendTelegramText(
    pending.telegramChatId,
    "Wallet connect request expired. Run /wallet connect to create a new one.",
    {
      ...(typeof pending.messageThreadId === "number"
        ? { messageThreadId: pending.messageThreadId }
        : {}),
    },
  );
};

export const shutdownWalletConnectFlows = async () => {
  const sessionIds = Array.from(pendingWalletConnectSessions.keys());
  await Promise.allSettled(
    sessionIds.map((sessionId) =>
      cleanupPendingWalletConnectSession(sessionId, {
        disconnect: true,
      }),
    ),
  );
};

export const verifyTonConnectProof = async (input: {
  telegramUserId: string;
  payload: TonConnectProofPayload;
  expectedPayload?: string;
}) => {
  if (
    input.expectedPayload &&
    input.payload.proof.payload !== input.expectedPayload
  ) {
    throw new Error("TonConnect proof payload does not match expected nonce.");
  }

  const tools = createWalletTools();
  const executeProof = tools.tonTonConnectProof.execute;
  if (!executeProof) {
    throw new Error("tonTonConnectProof execute function is unavailable.");
  }

  const verification = await executeProof(
    {
      address: input.payload.address,
      proof: input.payload.proof,
    } as never,
    {} as never,
  );

  const proofHash = hashProofPayload(
    JSON.stringify({
      address: input.payload.address,
      proof: input.payload.proof,
    }),
  );

  await linkWallet({
    telegramUserId: input.telegramUserId,
    address: input.payload.address,
    proofHash,
    ...(input.payload.publicKey ? { publicKey: input.payload.publicKey } : {}),
    ...(input.payload.walletAppName
      ? { walletApp: input.payload.walletAppName }
      : {}),
  });

  return verification;
};
