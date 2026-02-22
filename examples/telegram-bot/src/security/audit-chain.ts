import { createHash } from "node:crypto";

const hashEvent = (payload: string) =>
  createHash("sha256").update(payload).digest("hex");

export const createAuditHash = (
  previousHash: string | null,
  eventType: string,
  metadata: unknown,
  createdAtIso: string,
) => {
  const body = JSON.stringify({
    previousHash,
    eventType,
    metadata,
    createdAtIso,
  });
  return hashEvent(body);
};

