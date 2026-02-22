ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "message_thread_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_sessions_chat_user_thread_idx" ON "chat_sessions" USING btree ("telegram_chat_id","telegram_user_id","message_thread_id");
