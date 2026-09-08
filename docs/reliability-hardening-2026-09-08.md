# Downline reliability hardening — 2026-09-08

Status: implementation, local verification, and the production database migration are complete; production application rollout and post-deploy acceptance remain pending.

## Changes
- Durable scrypt password storage, legacy credential migration, fail-closed database errors, durable admin reset, and current admin password metadata.
- Next 15.5.25 / React 19.2.8 dependency update; removed unused vulnerable xlsx dependency; updated PostCSS. npm audit reports zero vulnerabilities.
- Explicit REST pagination, per-request read deduplication, parallel history reads, semantic timestamp comparison.
- Freshness-validated sync before scheduled report notifications. Durable delivery claims/receipts prevent duplicate sends. Ambiguous outcomes require review instead of automatic resend.
- Error/retry/loading states, visible-source timestamp, and foreground/manual refresh on My Organization.
- Public build revision and authenticated admin system-status endpoint.

## Verified
- 23 regression tests passed across 6 files; production build and typecheck passed.
- Chrome DevTools local isolated runtime: admin login; password change persists across isolated browser contexts; old password 401 and new password 200.
- Normal member local login succeeds, own report 200, admin status/reset endpoints 403; own password change 200.
- My Organization local mobile viewport 390px has document width 390px. Simulated failed fetch displays retry and preserves prior data; retry recovers.
- Local performance trace: LCP 300ms, INP 30ms, CLS 0.00; local /api/my 65ms. These use bundled local data and are not production benchmarks.
- No console errors on the normal local My Organization flow.
- Initial production trace after rollout exposed a 5.9s `/api/my` response and 5.1s LCP caused by per-month snapshot reads. The follow-up batches snapshot history into one database request and uses bundled history for months without a synchronized snapshot; production re-measurement is required after redeploy.
- The first follow-up reduced `/api/my` to a 2.69s median and LCP to 4.09s. A second follow-up removes an unused sponsor directory, filters hidden Keyman rows before serialization, and trims unused tree fields; production re-measurement is required after redeploy.
- Direct source timing showed three synchronized snapshot rows: the selected month took 1.49s and the two-row history request took 2.57s. The final query reads only the previous month needed by Keyman comparison and uses bundled history for earlier months.
- Snapshot reads use the Next.js 15 Data Cache for five minutes and are invalidated immediately after a successful snapshot write, reducing repeat latency without hiding a completed sync.
- Vercel owner CLI restored. Target project identity verified as prj_3a9o3fHpgOWBs3E6J8FPirtmPSK3.
- GitHub VERCEL_TOKEN replaced with a token scoped to Downline Analyzer, expires 2026-12-07; authenticated project API returned 200.
- Applied the telegram_deliveries migration to Supabase project dyrofaaovyqetwkdrmmf. Service-role REST read returned 200 with zero existing deliveries; RLS is enabled, anon/authenticated SELECT is denied, and the refreshed Security Advisor reports zero errors and zero warnings.
- Existing production deployment dpl_8bMYTyiETy81HevAu3aVVXi1Gwik is dated 2026-08-09.

## Required rollout gates
1. Deploy this revision, then assert /api/version matches the deployed Git SHA.
2. Verify production browser/API behavior with admin and a designated normal-member account, including actual source timestamp and API latency.
3. Verify the next sync -> notification workflow and partial-failure reporting. Do not replay uncertain Telegram sends.

The workflow changes must not be enabled without the delivery table and corresponding application deployment. Local tests do not establish production readiness.

## Remaining audit boundaries
- Existing block/unblock management still uses local files and should be migrated before relying on it as a durable account suspension control.
- Existing GitHub Pages static export is incompatible with server routes; Vercel is the production deployment target.
- Legacy tracked .env.production history requires separate credential rotation/history handling; this change does not expose or rewrite it.
