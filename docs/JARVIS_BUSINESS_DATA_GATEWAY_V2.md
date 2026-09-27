# Jarvis Business Data Gateway V2

Status: prepared on feature branch. Production activation requires the Supabase migration to be applied and the Vercel deployment to be promoted.

## Purpose

Expose a read-only, server-to-server dataset from Downline Analyzer to Jarvis without exposing `SUPABASE_SERVICE_ROLE_KEY` to the browser.

Endpoint:

`GET /api/jarvis/read-model`

Authentication:

- Existing Jarvis signed client identity flow.
- The route is excluded from normal browser-session middleware only because it authenticates itself.
- Failed signature verification returns HTTP 401.
- The browser never receives Supabase service-role credentials.

## Allowed read scopes

- `org.members.read`
- `org.structure.read`
- `org.performance.read`
- `org.activities.kpi.read`
- `learning.catalog.read`
- `learning.progress.read`
- `learning.assessment.read`
- `learning.skills.read`

The endpoint is intentionally fixed-scope. The client cannot request extra tables or arbitrary SQL.

## Data minimization

Jarvis receives:

- Member ID, name, sponsor/upline relationship, join date, level and country.
- Current rank, BV, active/qualified state and left/right volume.
- Bounded monthly performance history (default 12 months, maximum 24).
- Aggregated 7-day and 30-day activity KPIs.
- Learning module metadata and YouTube video IDs.
- Per-member video progress.
- Assessment score/pass status.
- Per-skill score.

Jarvis does not receive through this endpoint:

- Passwords or password metadata.
- Supabase keys or application secrets.
- Raw activity details.
- Contact names.
- Outcome notes.
- Assessment answer payloads.
- Arbitrary database tables.

## Learning tables

Migration `202609270001_jarvis_learning_read_model.sql` creates:

- `learning_modules`
- `member_video_progress`
- `member_assessments`
- `member_skill_scores`
- `jarvis_data_access_audit`

All tables have RLS enabled and privileges revoked from `anon` and `authenticated`. The current application architecture accesses them only from server-side code using the service role.

## Audit

Every successful `/api/jarvis/read-model` request attempts to append an audit row with:

- request time
- endpoint
- granted scopes
- result counts

Audit failure does not expose additional data and does not alter the underlying business snapshot.

## Activation checklist

1. Apply the Supabase migration to the Downline Analyzer production project.
2. Deploy the feature branch through the normal test/build gate.
3. From Jarvis, sign a GET request for the exact path `/api/jarvis/read-model`.
4. Verify HTTP 200 and confirm the response policy flags are all restrictive.
5. Verify `jarvis_data_access_audit` received the read entry.
6. Confirm no service-role key appears in browser bundles or network responses.
7. Only then connect the AI skill-gap/recommendation engine to this endpoint.
