import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  chatSessions,
  telegramChats,
  telegramUsers,
} from "@/db/schema";
import type { ChatType, TonNetwork } from "@/types/contracts";

export const upsertTelegramUser = async (input: {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  locale?: string;
}) => {
  const now = new Date();
  const valuePatch = {
    ...(input.username ? { username: input.username } : {}),
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
  };
  await db
    .insert(telegramUsers)
    .values({
      telegramUserId: input.telegramUserId,
      createdAt: now,
      updatedAt: now,
      ...valuePatch,
    })
    .onConflictDoUpdate({
      target: telegramUsers.telegramUserId,
      set: {
        updatedAt: now,
        ...valuePatch,
      },
    });

  const [row] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramUserId, input.telegramUserId))
    .limit(1);
  return row ?? null;
};

export const upsertTelegramChat = async (input: {
  telegramChatId: string;
  chatType: ChatType;
  modelId: string;
}) => {
  const now = new Date();
  await db
    .insert(telegramChats)
    .values({
      telegramChatId: input.telegramChatId,
      chatType: input.chatType,
      activeModel: input.modelId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: telegramChats.telegramChatId,
      set: {
        chatType: input.chatType,
        activeModel: input.modelId,
        updatedAt: now,
      },
    });

  const [row] = await db
    .select()
    .from(telegramChats)
    .where(eq(telegramChats.telegramChatId, input.telegramChatId))
    .limit(1);
  return row ?? null;
};

export const getTelegramChat = async (telegramChatId: string) => {
  const [row] = await db
    .select()
    .from(telegramChats)
    .where(eq(telegramChats.telegramChatId, telegramChatId))
    .limit(1);
  return row ?? null;
};

export const setChatNetwork = async (
  telegramChatId: string,
  network: TonNetwork,
) => {
  await db
    .update(telegramChats)
    .set({
      network,
      updatedAt: new Date(),
    })
    .where(eq(telegramChats.telegramChatId, telegramChatId));
};

export const getOrCreateSession = async (input: {
  telegramChatId: string;
  telegramUserId: string;
}) => {
  const existingRows = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.telegramChatId, input.telegramChatId),
        eq(chatSessions.telegramUserId, input.telegramUserId),
      ),
    )
    .orderBy(desc(chatSessions.createdAt))
    .limit(1);

  const existing = existingRows[0];
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(chatSessions)
    .values({
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      stateJson: {},
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create chat session.");
  }
  return created;
};

export const touchSession = async (sessionId: string) => {
  await db
    .update(chatSessions)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId));
};

export const updateSessionState = async (
  sessionId: string,
  stateJson: Record<string, unknown>,
) => {
  await db
    .update(chatSessions)
    .set({
      stateJson,
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId));
};

export const getSessionById = async (sessionId: string) => {
  const [row] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);
  return row ?? null;
};
