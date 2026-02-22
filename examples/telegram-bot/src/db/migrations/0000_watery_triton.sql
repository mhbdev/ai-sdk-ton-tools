CREATE TYPE "public"."chat_type" AS ENUM('private', 'group', 'supergroup', 'channel');--> statement-breakpoint
CREATE TYPE "public"."ton_network" AS ENUM('mainnet', 'testnet');--> statement-breakpoint
CREATE TYPE "public"."tool_approval_status" AS ENUM('requested', 'approved', 'denied', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."processed_update_status" AS ENUM('received', 'enqueued', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(16) NOT NULL,
	"parts_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"correlation_id" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" varchar(32) NOT NULL,
	"actor_id" varchar(64) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"correlation_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"hash_chain" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" varchar(32) NOT NULL,
	"telegram_user_id" varchar(32) NOT NULL,
	"state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_updates" (
	"telegram_update_id" text NOT NULL,
	"raw_update_json" jsonb NOT NULL,
	"status" "processed_update_status" DEFAULT 'received' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"handled_at" timestamp,
	"error" text,
	CONSTRAINT "processed_updates_telegram_update_id_pk" PRIMARY KEY("telegram_update_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" varchar(32) NOT NULL,
	"chat_type" "chat_type" NOT NULL,
	"network" "ton_network" DEFAULT 'mainnet' NOT NULL,
	"active_model" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" varchar(32) NOT NULL,
	"username" varchar(64),
	"first_name" varchar(255),
	"locale" varchar(16),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_approvals" (
	"approval_id" varchar(80) PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"tool_name" varchar(120) NOT NULL,
	"tool_call_id" varchar(120) NOT NULL,
	"input_json" jsonb NOT NULL,
	"status" "tool_approval_status" DEFAULT 'requested' NOT NULL,
	"reason" text,
	"expires_at" timestamp NOT NULL,
	"decided_at" timestamp,
	"decided_by" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" varchar(32) NOT NULL,
	"address" varchar(128) NOT NULL,
	"public_key" varchar(256),
	"wallet_app" varchar(128),
	"proof_hash" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_messages_session_created_idx" ON "agent_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_chat_user_idx" ON "chat_sessions" USING btree ("telegram_chat_id","telegram_user_id");--> statement-breakpoint
CREATE INDEX "telegram_chats_telegram_chat_id_idx" ON "telegram_chats" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "telegram_users_telegram_user_id_idx" ON "telegram_users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "tool_approvals_session_idx" ON "tool_approvals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tool_approvals_expiry_idx" ON "tool_approvals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "wallet_links_telegram_user_idx" ON "wallet_links" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "wallet_links_address_idx" ON "wallet_links" USING btree ("address");