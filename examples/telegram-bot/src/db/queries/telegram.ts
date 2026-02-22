import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  chatSessions,
  telegramChats,
  telegramUsers,
} from "@/db/schema";
import type {
  ChatType,
  ResponseStyle,
  RiskProfile,
  TonNetwork,
} from "@/types/contracts";

export const upsertTelegramUser = async (input: {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  locale?: string;
  defaultResponseStyle?: ResponseStyle;
  defaultRiskProfile?: RiskProfile;
  defaultNetwork?: TonNetwork;
  defaultWalletLinkId?: string | null;
}) => {
  const now = new Date();
  const valuePatch = {
    ...(input.username ? { username: input.username } : {}),
    ...(input.firstName ? { firstName: input.firstName } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.defaultResponseStyle
      ? { defaultResponseStyle: input.defaultResponseStyle }
      : {}),
    ...(input.defaultRiskProfile
      ? { defaultRiskProfile: input.defaultRiskProfile }
      : {}),
    ...(input.defaultNetwork ? { defaultNetwork: input.defaultNetwork } : {}),
    ...("defaultWalletLinkId" in input
      ? { defaultWalletLinkId: input.defaultWalletLinkId ?? null }
      : {}),
  };
  const [updated] = await db
    .update(telegramUsers)
    .set({
      updatedAt: now,
      ...valuePatch,
    })
    .where(eq(telegramUsers.telegramUserId, input.telegramUserId))
    .returning();
  if (updated) {
    return updated;
  }

  const [inserted] = await db
    .insert(telegramUsers)
    .values({
      telegramUserId: input.telegramUserId,
      createdAt: now,
      updatedAt: now,
      ...valuePatch,
    })
    .returning();
  if (inserted) {
    return inserted;
  }

  const [row] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramUserId, input.telegramUserId))
    .limit(1);
  return row ?? null;
};

export const getTelegramUser = async (telegramUserId: string) => {
  const [row] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramUserId, telegramUserId))
    .limit(1);
  return row ?? null;
};

export const upsertTelegramChat = async (input: {
  telegramChatId: string;
  chatType: ChatType;
  modelId: string;
}) => {
  const now = new Date();
  const [updated] = await db
    .update(telegramChats)
    .set({
      chatType: input.chatType,
      updatedAt: now,
    })
    .where(eq(telegramChats.telegramChatId, input.telegramChatId))
    .returning();
  if (updated) {
    return updated;
  }

  const [inserted] = await db
    .insert(telegramChats)
    .values({
      telegramChatId: input.telegramChatId,
      chatType: input.chatType,
      activeModel: input.modelId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (inserted) {
    return inserted;
  }

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

export const setTelegramUserPreferences = async (input: {
  telegramUserId: string;
  responseStyle?: ResponseStyle;
  riskProfile?: RiskProfile;
  network?: TonNetwork;
  defaultWalletLinkId?: string | null;
}) => {
  const patch = {
    ...(input.responseStyle ? { defaultResponseStyle: input.responseStyle } : {}),
    ...(input.riskProfile ? { defaultRiskProfile: input.riskProfile } : {}),
    ...(input.network ? { defaultNetwork: input.network } : {}),
    ...("defaultWalletLinkId" in input
      ? { defaultWalletLinkId: input.defaultWalletLinkId ?? null }
      : {}),
    updatedAt: new Date(),
  };

  const [row] = await db
    .update(telegramUsers)
    .set(patch)
    .where(eq(telegramUsers.telegramUserId, input.telegramUserId))
    .returning();
  return row ?? null;
};

export const setTelegramChatPreferences = async (input: {
  telegramChatId: string;
  responseStyleOverride?: ResponseStyle | null;
  riskProfileOverride?: RiskProfile | null;
  network?: TonNetwork;
}) => {
  const patch = {
    ...("responseStyleOverride" in input
      ? { responseStyleOverride: input.responseStyleOverride ?? null }
      : {}),
    ...("riskProfileOverride" in input
      ? { riskProfileOverride: input.riskProfileOverride ?? null }
      : {}),
    ...(input.network ? { network: input.network } : {}),
    updatedAt: new Date(),
  };

  const [row] = await db
    .update(telegramChats)
    .set(patch)
    .where(eq(telegramChats.telegramChatId, input.telegramChatId))
    .returning();
  return row ?? null;
};

const buildSessionScopeFilter = (input: {
  telegramChatId: string;
  telegramUserId: string;
  messageThreadId?: number;
}) => {
  const scopedThreadFilter =
    typeof input.messageThreadId === "number"
      ? eq(chatSessions.messageThreadId, input.messageThreadId)
      : isNull(chatSessions.messageThreadId);

  return and(
    eq(chatSessions.telegramChatId, input.telegramChatId),
    eq(chatSessions.telegramUserId, input.telegramUserId),
    scopedThreadFilter,
  );
};

export const findSessionByScope = async (input: {
  telegramChatId: string;
  telegramUserId: string;
  messageThreadId?: number;
}) => {
  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(buildSessionScopeFilter(input))
    .orderBy(desc(chatSessions.createdAt))
    .limit(1);

  return existing ?? null;
};

export const getOrCreateSession = async (input: {
  telegramChatId: string;
  telegramUserId: string;
  messageThreadId?: number;
}) => {
  const existing = await findSessionByScope(input);
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(chatSessions)
    .values({
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      messageThreadId:
        typeof input.messageThreadId === "number" ? input.messageThreadId : null,
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
