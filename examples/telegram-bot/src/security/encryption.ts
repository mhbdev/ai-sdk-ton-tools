import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getEnv } from "@/config/env";

const ALGO = "aes-256-gcm";

const deriveKey = () => {
  const env = getEnv();
  const seed = `${env.KMS_KEY_ID}:${env.ENCRYPTION_MASTER_KEY}`;
  return createHash("sha256").update(seed).digest();
};

const key = deriveKey();

export type EncryptedPayload = {
  iv: string;
  ciphertext: string;
  authTag: string;
};

export const encryptField = (plaintext: string): EncryptedPayload => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
};

export const decryptField = (payload: EncryptedPayload): string => {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

