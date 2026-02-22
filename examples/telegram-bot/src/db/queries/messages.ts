import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentMessages } from "@/db/schema";

export const saveAgentMessage = async (input: {
  sessionId: string;
  role: string;
  partsJson: unknown;
  correlationId: string;
}) => {
  const [row] = await db
    .insert(agentMessages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      partsJson: input.partsJson,
      correlationId: input.correlationId,
      createdAt: new Date(),
    })
    .returning();

  return row;
};

export const getAgentMessagesBySession = async (
  sessionId: string,
  limit = 80,
) => {
  return db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.sessionId, sessionId))
    .orderBy(asc(agentMessages.createdAt))
    .limit(limit);
};

