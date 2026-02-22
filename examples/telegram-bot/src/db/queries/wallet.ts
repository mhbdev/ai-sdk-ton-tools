import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { walletLinks } from "@/db/schema";

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
  await deactivateWalletLinks(input.telegramUserId);
  const [row] = await db
    .insert(walletLinks)
    .values({
      telegramUserId: input.telegramUserId,
      address: input.address,
      proofHash: input.proofHash,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(input.publicKey ? { publicKey: input.publicKey } : {}),
      ...(input.walletApp ? { walletApp: input.walletApp } : {}),
    })
    .returning();
  return row;
};

export const getActiveWallet = async (telegramUserId: string) => {
  const [row] = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.telegramUserId, telegramUserId),
        eq(walletLinks.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
};
