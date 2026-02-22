CREATE TYPE "public"."response_style" AS ENUM('concise', 'detailed');--> statement-breakpoint
CREATE TYPE "public"."risk_profile" AS ENUM('cautious', 'balanced', 'advanced');--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "message_thread_id" integer;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD COLUMN "response_style_override" "response_style";--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD COLUMN "risk_profile_override" "risk_profile";--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN "default_response_style" "response_style" DEFAULT 'concise' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN "default_risk_profile" "risk_profile" DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN "default_network" "ton_network" DEFAULT 'mainnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_users" ADD COLUMN "default_wallet_link_id" uuid;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN "callback_token" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN "telegram_chat_id" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN "message_thread_id" integer;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN "prompt_message_id" integer;--> statement-breakpoint
ALTER TABLE "tool_approvals" ADD COLUMN "risk_profile" "risk_profile" DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD COLUMN "label" varchar(64);--> statement-breakpoint
ALTER TABLE "wallet_links" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_sessions_chat_user_thread_idx" ON "chat_sessions" USING btree ("telegram_chat_id","telegram_user_id","message_thread_id");--> statement-breakpoint
CREATE INDEX "tool_approvals_callback_token_idx" ON "tool_approvals" USING btree ("callback_token");--> statement-breakpoint
CREATE INDEX "wallet_links_default_idx" ON "wallet_links" USING btree ("telegram_user_id","is_default");