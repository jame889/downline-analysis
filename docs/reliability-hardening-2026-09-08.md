# Downline reliability hardening — 2026-09-08

Status: implementation and local verification complete for the listed changes; production rollout pending database migration and post-deploy acceptance.

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
- Vercel owner CLI restored. Target project identity verified as prj_3a9o3fHpgOWBs3E6J8FPirtmPSK3.
- GitHub VERCEL_TOKEN replaced with a token scoped to Downline Analyzer, expires 2026-12-07; authenticated project API returned 200.
- Existing production deployment dpl_8bMYTyiETy81HevAu3aVVXi1Gwik is dated 2026-08-09.

## Required rollout gates
1. Apply supabase/migrations/20260908150356_telegram_delivery_ledger.sql to project dyrofaaovyqetwkdrmmf. Current service-role REST access cannot create tables; owner database access is pending.
2. Verify RLS/privileges and durable claim/receipt behavior against the deployed database before sending.
3. Deploy this revision, then assert /api/version matches the deployed Git SHA.
4. Verify production browser/API behavior with admin and a designated normal-member account, including actual source timestamp and API latency.
5. Verify the next sync -> notification workflow and partial-failure reporting. Do not replay uncertain Telegram sends.

The workflow changes must not be enabled without the delivery table and corresponding application deployment. Local tests do not establish production readiness.

## Remaining audit boundaries
- Existing block/unblock management still uses local files and should be migrated before relying on it as a durable account suspension control.
- Existing GitHub Pages static export is incompatible with server routes; Vercel is the production deployment target.
- Legacy tracked .env.production history requires separate credential rotation/history handling; this change does not expose or rewrite it.
