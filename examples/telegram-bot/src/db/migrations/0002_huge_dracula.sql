DO $$
BEGIN
  CREATE TYPE "public"."response_style" AS ENUM('concise', 'detailed');
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."risk_profile" AS ENUM('cautious', 'balanced', 'advanced');
EXCEPTION
  WHEN duplicate_object THEN null;
END
$$;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "message_thread_id" integer;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD COLUMN IF NOT EXISTS "response_style_override" "response_style";--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD COLUMN IF NOT EXISTS "risk_profile_override" "risk_profile";--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_response_style" "response_style";--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_risk_profile" "risk_profile";--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_network" "ton_network";--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN IF NOT EXISTS "default_wallet_link_id" uuid;--> statement-breakpoint
UPDATE "telegram_users"
SET "default_response_style" = 'concise'
WHERE "default_response_style" IS NULL;--> statement-breakpoint
UPDATE "telegram_users"
SET "default_risk_profile" = 'balanced'
WHERE "default_risk_profile" IS NULL;--> statement-breakpoint
UPDATE "telegram_users"
SET "default_network" = 'mainnet'
WHERE "default_network" IS NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_response_style" SET DEFAULT 'concise';--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_response_style" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_risk_profile" SET DEFAULT 'balanced';--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_risk_profile" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_network" SET DEFAULT 'mainnet';--> statement-breakpoint
ALTER TABLE "telegram_users" ALTER COLUMN "default_network" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "callback_token" varchar(32);--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(32);--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "message_thread_id" integer;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "prompt_message_id" integer;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN IF NOT EXISTS "risk_profile" "risk_profile";--> statement-breakpoint
UPDATE "tool_approvals"
SET "callback_token" = substring(md5(random()::text || clock_timestamp()::text || "approval_id"), 1, 32)
WHERE "callback_token" IS NULL;--> statement-breakpoint
UPDATE "tool_approvals"
SET "telegram_chat_id" = '0'
WHERE "telegram_chat_id" IS NULL;--> statement-breakpoint
UPDATE "tool_approvals"
SET "risk_profile" = 'balanced'
WHERE "risk_profile" IS NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ALTER COLUMN "callback_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ALTER COLUMN "telegram_chat_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ALTER COLUMN "risk_profile" SET DEFAULT 'balanced';--> statement-breakpoint
ALTER TABLE "tool_approvals" ALTER COLUMN "risk_profile" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD COLUMN IF NOT EXISTS "label" varchar(64);--> statement-breakpoint
ALTER TABLE "wallet_links" ADD COLUMN IF NOT EXISTS "is_default" boolean;--> statement-breakpoint
UPDATE "wallet_links"
SET "is_default" = false
WHERE "is_default" IS NULL;--> statement-breakpoint
ALTER TABLE "wallet_links" ALTER COLUMN "is_default" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "wallet_links" ALTER COLUMN "is_default" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_sessions_chat_user_thread_idx" ON "chat_sessions" USING btree ("telegram_chat_id","telegram_user_id","message_thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_approvals_callback_token_idx" ON "tool_approvals" USING btree ("callback_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_links_default_idx" ON "wallet_links" USING btree ("telegram_user_id","is_default");
