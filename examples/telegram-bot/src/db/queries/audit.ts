import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { createAuditHash } from "@/security/audit-chain";
import type { AuditEventRecord } from "@/types/contracts";

export const appendAuditEvent = async (event: AuditEventRecord) => {
  const [lastEvent] = await db
    .select({ hashChain: auditEvents.hashChain })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  const createdAt = new Date();
  const hashChain = createAuditHash(
    lastEvent?.hashChain ?? null,
    event.eventType,
    event.metadata,
    createdAt.toISOString(),
  );

  const [row] = await db
    .insert(auditEvents)
    .values({
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      metadataJson: event.metadata,
      correlationId: event.correlationId,
      createdAt,
      hashChain,
    })
    .returning();

  return row;
};

