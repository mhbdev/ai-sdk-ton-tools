# Data Retention Policy

- `processed_updates`: retain 30 days.
- `agent_messages`: retain 90 days (configurable).
- `tool_approvals`: retain 180 days for auditability.
- `audit_events`: retain 365 days minimum.
- `wallet_links`: retain active + last inactive record; purge stale inactive records after 365 days.

## Deletion Process
1. Run scheduled retention job daily.
2. Export audit metrics before deletion.
3. Log retention execution as `audit_events`.
