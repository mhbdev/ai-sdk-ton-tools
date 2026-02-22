import { randomBytes } from "node:crypto";
import { createTonTools } from "@mhbdev/ai-sdk-ton-tools";
import { getEnv } from "@/config/env";
import { hashProofPayload } from "@/approvals/service";
import { getOrCreateSession, linkWallet, updateSessionState } from "@/db/queries";

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

const createWalletTools = () =>
  createTonTools({
    apiKey: getEnv().TONAPI_API_KEY,
    network: "mainnet",
  });

export const createTonConnectNonce = () => randomBytes(16).toString("hex");

export const issueWalletConnectChallenge = async (input: {
  telegramChatId: string;
  telegramUserId: string;
}) => {
  const session = await getOrCreateSession({
    telegramChatId: input.telegramChatId,
    telegramUserId: input.telegramUserId,
  });

  const nonce = createTonConnectNonce();
  const previousState =
    session.stateJson && typeof session.stateJson === "object"
      ? (session.stateJson as Record<string, unknown>)
      : {};

  await updateSessionState(session.id, {
    ...previousState,
    tonConnectNonce: nonce,
    tonConnectNonceIssuedAt: new Date().toISOString(),
  });

  const env = getEnv();
  const manifest = encodeURIComponent(env.TONCONNECT_MANIFEST_URL);

  return {
    nonce,
    connectHint:
      `Open your wallet and connect using manifest: ${env.TONCONNECT_MANIFEST_URL}\n` +
      `Nonce: ${nonce}\n` +
      `Manifest (url-encoded): ${manifest}`,
  };
};

export const verifyTonConnectProof = async (input: {
  telegramUserId: string;
  payload: TonConnectProofPayload;
}) => {
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

export const parseProofPayloadFromCommand = (
  commandText: string,
): TonConnectProofPayload | null => {
  const parts = commandText.trim().split(" ");
  if (parts.length < 3) {
    return null;
  }
  const encoded = parts.slice(2).join(" ");

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as TonConnectProofPayload;
    return parsed;
  } catch {
    return null;
  }
};
