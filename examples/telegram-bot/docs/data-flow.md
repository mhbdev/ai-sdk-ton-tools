# Data Flow

1. Telegram sends `Update` to webhook (or polling reads it).
2. Service deduplicates using `processed_updates`.
3. Update is enqueued to `updates` queue.
4. Update worker routes command or enqueues `agent-turn`.
5. Agent worker acquires per-chat lock and runs AI SDK ToolLoopAgent.
6. Tool approvals are persisted and timeout jobs scheduled.
7. Bot replies are posted to Telegram.
8. Audit events are appended with hash chaining.
