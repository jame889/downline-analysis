# Jarvis Downline Intelligence Gateway V1

Status: implementation in progress

Purpose: push normalized downline change events from Downline Analyzer to Jarvis after each successful business report sync. Full-state polling remains fallback only.

Canonical event namespace: `jarvis.downline.*`

Planned events:
- `jarvis.downline.member_joined`
- `jarvis.downline.bv_changed`
- `jarvis.downline.rank_changed`
- `jarvis.downline.leg_growth`
- `jarvis.downline.activity_added`
- `jarvis.downline.inactive_risk`
- `jarvis.downline.keyman_emerging`
- `jarvis.downline.keyman_declining`
- `jarvis.downline.goal_progress`
- `jarvis.downline.sync_completed`

Flow:

`Downline Analyzer -> Event/Diff Engine -> Jarvis ingestion endpoint -> Business Data Gateway -> Memory/Reasoning -> Control Room`

Design constraints:
- Do not scrape the Downline Analyzer web UI.
- Push after successful sync.
- Emit a compact diff plus a `sync_completed` envelope.
- Keep payloads bounded and avoid unnecessary PII.
- Use an HMAC/shared-secret authorization header for server-to-server delivery.
- Delivery must be idempotent using a deterministic event id.
- Delivery failure must not corrupt the synced Downline Analyzer snapshot.
- Polling/full-state reads exist only as recovery/fallback.
