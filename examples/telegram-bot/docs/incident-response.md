# Incident Response Runbook

## Severity Levels
- SEV1: critical outage or unauthorized critical action
- SEV2: degraded queue/latency or repeated tool failures
- SEV3: isolated user-impacting defects

## Immediate Steps
1. Triage health endpoints and queue depth.
2. Disable write-capable tools via feature flag if needed.
3. Rotate bot token if compromise suspected.
4. Preserve logs, queue payload references, and audit chain snapshots.
5. Notify stakeholders and document timeline.

## Recovery
1. Replay dead-letter updates after fix.
2. Validate approval workflow and webhook auth end-to-end.
3. Publish post-incident report with remediation items.
