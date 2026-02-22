# Threat Model (Baseline)

## Assets
- Telegram bot token
- user wallet linkage metadata
- approval decisions and audit log
- chat/session history

## Threats
- webhook spoofing
- prompt injection to trigger unauthorized write tools
- replayed approval callbacks
- leaked secrets in logs
- queue flooding / denial-of-service

## Controls
- path + header secret validation for webhook
- tool policy allowlist/denylist with forced approvals
- idempotency table for updates
- per-user/per-chat rate limiting
- structured redaction for sensitive logs
- immutable hash-chain audit trail
