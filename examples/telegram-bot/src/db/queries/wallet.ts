import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { telegramUsers, walletLinks } from "@/db/schema";

export const deactivateWalletLinks = async (telegramUserId: string) => {
  await db
    .update(walletLinks)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(walletLinks.telegramUserId, telegramUserId));
};

export const linkWallet = async (input: {
  telegramUserId: string;
  address: string;
  publicKey?: string;
  walletApp?: string;
  proofHash: string;
}) => {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, input.telegramUserId),
        eq(walletLinks.address, input.address),
      ),
    )
    .limit(1);

  let wallet =
    existing ??
    (
      await db
        .insert(walletLinks)
        .values({
          telegramUserId: input.telegramUserId,
          address: input.address,
          proofHash: input.proofHash,
          isActive: true,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          ...(input.publicKey ? { publicKey: input.publicKey } : {}),
          ...(input.walletApp ? { walletApp: input.walletApp } : {}),
        })
        .returning()
    )[0] ??
    null;

  if (!wallet) {
    throw new Error("Failed to link wallet.");
  }

  const [updatedWallet] = await db
    .update(walletLinks)
    .set({
      isActive: true,
      proofHash: input.proofHash,
      updatedAt: now,
      ...(input.publicKey ? { publicKey: input.publicKey } : {}),
      ...(input.walletApp ? { walletApp: input.walletApp } : {}),
    })
    .where(eq(walletLinks.id, wallet.id))
    .returning();
  wallet = updatedWallet ?? wallet;

  const [defaultWallet] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, input.telegramUserId),
        eq(walletLinks.isActive, true),
        eq(walletLinks.isDefault, true),
      ),
    )
    .limit(1);

  if (!defaultWallet) {
    const [promoted] = await db
      .update(walletLinks)
      .set({
        isDefault: true,
        updatedAt: now,
      })
      .where(eq(walletLinks.id, wallet.id))
      .returning();

    await db
      .update(telegramUsers)
      .set({
        defaultWalletLinkId: wallet.id,
        updatedAt: now,
      })
      .where(eq(telegramUsers.telegramUserId, input.telegramUserId));

    return promoted ?? wallet;
  }

  return wallet;
};

export const listWalletsByUser = async (telegramUserId: string) =>
  db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, telegramUserId),
        eq(walletLinks.isActive, true),
      ),
    )
    .orderBy(desc(walletLinks.isDefault), desc(walletLinks.updatedAt));

export const setDefaultWallet = async (input: {
  telegramUserId: string;
  walletId: string;
}) => {
  await db
    .update(walletLinks)
    .set({
      isDefault: sql`CASE WHEN ${walletLinks.id} = ${input.walletId} THEN true ELSE false END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(walletLinks.telegramUserId, input.telegramUserId),
        eq(walletLinks.isActive, true),
      ),
    );

  await db
    .update(telegramUsers)
    .set({
      defaultWalletLinkId: input.walletId,
      updatedAt: new Date(),
    })
    .where(eq(telegramUsers.telegramUserId, input.telegramUserId));

  const [row] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, input.telegramUserId),
        eq(walletLinks.id, input.walletId),
      ),
    )
    .limit(1);
  return row ?? null;
};

export const getDefaultWallet = async (telegramUserId: string) => {
  const [explicit] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, telegramUserId),
        eq(walletLinks.isActive, true),
        eq(walletLinks.isDefault, true),
      ),
    )
    .limit(1);
  if (explicit) {
    return explicit;
  }

  const [fallback] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, telegramUserId),
        eq(walletLinks.isActive, true),
      ),
    )
    .orderBy(desc(walletLinks.updatedAt))
    .limit(1);

  if (!fallback) {
    return null;
  }

  await setDefaultWallet({
    telegramUserId,
    walletId: fallback.id,
  });
  return fallback;
};

export const getActiveWallet = async (telegramUserId: string) => {
  return getDefaultWallet(telegramUserId);
};
