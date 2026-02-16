import { z } from "zod";

export const addressSchema = z
  .string()
  .min(1)
  .describe("TON account address in raw or user-friendly format.");

export const optionalAddressSchema = addressSchema
  .optional()
  .describe("Optional TON address in raw or user-friendly format.");

export const addressListSchema = z
  .array(addressSchema)
  .min(1)
  .max(1000)
  .describe("List of TON addresses.");

export const publicKeySchema = z
  .string()
  .min(1)
  .describe("Wallet public key (hex or base64).");

export const bocSchema = z.string().min(1).describe("Base64-encoded BOC.");

export const ltSchema = z
  .union([z.string(), z.number().int()])
  .describe("Logical time (lt). Use string for very large values.");

export const timestampSchema = z
  .number()
  .int()
  .describe("Unix timestamp in seconds.");

export const stateInitSchema = z
  .string()
  .min(1)
  .describe("Base64-encoded state init BOC.");
