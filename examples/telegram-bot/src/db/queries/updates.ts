import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { processedUpdates } from "@/db/schema";
import type { ProcessedUpdateStatus } from "@/types/contracts";

export const tryInsertProcessedUpdate = async (input: {
  updateId: number;
  rawUpdateJson: unknown;
}) => {
  const updateId = String(input.updateId);
  const [created] = await db
    .insert(processedUpdates)
    .values({
      telegramUpdateId: updateId,
      rawUpdateJson: input.rawUpdateJson,
      status: "received",
      receivedAt: new Date(),
    })
    .onConflictDoNothing({
      target: processedUpdates.telegramUpdateId,
    })
    .returning();

  if (created) {
    return { inserted: true, record: created };
  }

  const [existing] = await db
    .select()
    .from(processedUpdates)
    .where(eq(processedUpdates.telegramUpdateId, updateId))
    .limit(1);

  if (existing) {
    return { inserted: false, record: existing };
  }

  return { inserted: false, record: null };
};

export const markProcessedUpdateStatus = async (input: {
  updateId: number;
  status: ProcessedUpdateStatus;
  error?: string;
}) => {
  await db
    .update(processedUpdates)
    .set({
      status: input.status,
      handledAt:
        input.status === "processed" || input.status === "failed"
          ? new Date()
          : undefined,
      error: input.error,
    })
    .where(eq(processedUpdates.telegramUpdateId, String(input.updateId)));
};

export const getProcessedUpdateById = async (updateId: number) => {
  const [row] = await db
    .select()
    .from(processedUpdates)
    .where(eq(processedUpdates.telegramUpdateId, String(updateId)))
    .limit(1);
  return row ?? null;
};

