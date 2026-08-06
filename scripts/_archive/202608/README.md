# scripts/_archive/202608/

## scripts/migrations/ (all 12 files)
Archived 2026-08-06 (portfolio correctness/redundancy audit).

Everything moved here from `scripts/migrations/` was a one-off SQL script,
already applied by hand to the live Supabase project (`tsruqbodyrmxqzhvxret`)
during the 2026-04-29 through 2026-05-14 window — via the Supabase SQL
Editor or the Supabase MCP `execute_sql` tool, not via `supabase db push`.
None of them follow a numbered/tracked migration convention, and none are
referenced by `package.json`, docs, or CI (`git grep scripts/migrations`
across the whole repo returns nothing).

The real, Supabase-CLI-tracked migration folder is `supabase/migrations/`
(`YYYYMMDD_description.sql`), which starts on 2026-05-17 — the day
immediately after the last file here. That's a clean cutover, not a gap:
this folder is the pre-cutover ad hoc period, `supabase/migrations/` is
everything since.

The schema/RPCs/cron jobs these scripts created are still live and
load-bearing today — confirmed by cross-referencing current app code and
edge functions:
- `syndication_targets` (2026-04-29) — read by the post-job form.
- `verified_via` / `verified_at` co-consistency (2026-04-30, 2026-05-14
  `allow_ats_import_verified_via`) — read by the directory page and
  homepage verified-employer count.
- `apply_notify_context_rpc` (2026-05-01) — called by
  `supabase/functions/apply-notify`.
- The unicode-escape fix to `apply_to_job_rpc` (2026-05-01) — still the
  live function body; the fix wasn't superseded, just never re-migrated
  through the tracked folder.
- `consume_candidate_edit_rpc`'s matches extension (2026-05-01) and
  `get_resume_upload_context_rpc` (2026-05-02) — used by the
  candidate-facing dashboard and resume-uploaded-notify email flow.
- The anon EXECUTE revocations (2026-05-02) — a one-time grant cleanup,
  nothing to re-run; anon still has no EXECUTE on those functions today.
- `public_employers.slug` + the `public_employers_directory` view
  (2026-05-08) — read by `/employers/[slug]`.
- `is_ats_import`, `ats_import_upsert_jobs`, and the `refresh-ats-imports`
  pg_cron schedule (2026-05-14, three files) — called by
  `supabase/functions/refresh-ats-imports` on its 4-hour cron tick, and
  read by `src/lib/syndication-targets.ts` and the marketplace-match
  notification path.

None of this is dead code — it's applied, live, one-shot DDL/DML with
nowhere else to live now that the repo has a real tracked migrations
folder. Archived rather than deleted so the applied-schema history stays
visible. There is nothing to `git mv` back — re-running any of these
against the live DB would either no-op (idempotent `IF NOT EXISTS` /
`CREATE OR REPLACE` guards) or, in a couple of cases, redundantly repeat
work already reflected in the current schema. If a fresh environment ever
needs to be bootstrapped from scratch, use `supabase/migrations/` plus a
fresh dump of the current live schema, not these.

Files, in original applied order:
- `2026-04-29_add_syndication_targets.sql`
- `2026-04-30_verified_employer_columns.sql`
- `2026-05-01_apply_notify_context_rpc.sql`
- `2026-05-01_apply_rpc_unicode_escape_fix.sql`
- `2026-05-01_consume_candidate_edit_returns_matches.sql`
- `2026-05-02_resume_upload_context_rpc.sql`
- `2026-05-02_security_least_privilege_anon_grants.sql`
- `2026-05-08_employer_slug.sql`
- `2026-05-14_allow_ats_import_verified_via.sql`
- `2026-05-14_ats_import_isolation_from_crm.sql`
- `2026-05-14_ats_import_upsert_function.sql`
- `2026-05-14_refresh_ats_imports_cron.sql`
