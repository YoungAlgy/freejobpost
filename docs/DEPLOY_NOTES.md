# Deploy notes — freejobpost.co

Pre-push checklist for the Vercel deploy. Last refreshed 2026-05-22 after the
overnight audit-pass session that uncovered + fixed several critical bugs in
the SEO surface. Every commit on `origin/main` since `42d9c5e` is covered.

## Most important commits (skim these before deploy)

| Commit | What | Why it matters |
|---|---|---|
| `6e2b839` | **fix(critical): specialty hub + matrix .or() double-encoding** | THE bug of the session. encodeURIComponent inside the runtime filter caused space-containing matchPatterns (PA, RN, family-medicine, internal-medicine, hospital-medicine, ER, OB-GYN, etc.) to silently return 0 jobs at runtime. Build-time + sitemap thought the cells existed; runtime 404'd them. Fix unlocks 150+ matrix cells + 6 specialty hub pages that were silent zeroes. |
| `aee278f` | feat: 5 more career-path guides + per-{specialty,state} RSS | 79 new SEO surfaces |
| `c0a55ab` | feat: /city/[slug] hub pages — 32 US healthcare metros | New long-tail surface between state hubs + per-job pages |
| `f7e930b` | feat: city×specialty matrix + JSON-LD validator + typo redirects | ~30+ new long-tail pages + 26 protective unit tests catching JobPosting markup regressions |
| `41c8366` | feat: ATS edge function pings Google Indexing API on new jobs | Indexing latency for ATS-imported jobs drops from ~24h to ~15min once GCP setup is done |
| `2bc6587` | feat: Google Indexing API integration (Next.js side) | Same as above but for /post-job/verify flow |
| `6f207bf` | fix: correct remote-job JobPosting JSON-LD | Remote jobs were emitting both `jobLocation` + `jobLocationType:TELECOMMUTE` — Google rejects that |
| `4d6a2d9` | fix: partner_attribution_daily view recognizes service_role | /admin/attribution would have rendered empty in prod without this |
| `94997ca` | fix: empty-array syndication_targets semantics | 655 ATS jobs were silently missing from Google for Jobs + every partner feed |
| `120691f` | fix: thin-description filter on partner feeds | 24% of corpus had empty descriptions polluting partner feeds |

## Full commit list

Run `git log --oneline 42d9c5e~1..HEAD --reverse` for the complete chronological log. ~50 commits, no breaking schema changes, fully backward-compatible.

## Vercel env vars to set BEFORE first deploy

Both server-side only. Mark as not-public in Vercel project settings.

| Var | Why | How to generate |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `/admin/attribution` reads `partner_attribution_daily` via service-role to bypass RLS | Supabase Dashboard → Project Settings → API → service_role key |
| `ADMIN_DASHBOARD_KEY` | Query-param gate for `/admin/attribution?key=…` | `openssl rand -hex 24` once, bookmark the URL+key combo |
| `GOOGLE_SERVICE_ACCOUNT_JSON` (optional) | Activates Google Indexing API pings on every new job verify — drops Google for Jobs indexing latency from ~24h to ~15 min | GCP service-account JSON key. Full setup playbook in `docs/GOOGLE_FOR_JOBS.md`. Safe to leave unset — code is a no-op without it. |

If `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_DASHBOARD_KEY` is missing, `/admin/attribution` 404s rather than 500ing — no information leakage. So a partial deploy is safe; the dashboard just won't work until both are set. `GOOGLE_SERVICE_ACCOUNT_JSON` is fully optional — verify-page flow runs normally without it.

## Supabase migrations to apply

Run via `supabase db push` or apply manually in the SQL editor. Order matters (alphabetical date prefix):

1. `20260520_ats_import_syndication_targets_default.sql` — **new this batch**, fixes `ats_import_upsert_jobs` RPC default + backfills 655 empty rows + catches up 8,961 rows with `careerjet`.
2. `20260520_partner_attribution_daily_view.sql` — `partner_attribution_daily` view powering `/admin/attribution`. **Updated this batch** to recognize `service_role` JWT (the original would have returned 0 rows under the service-role client).
3. `20260520_syndication_targets_add_careerjet.sql` — no-op after #1 (idempotent).
4. `20260520_syndication_targets_backfill_volume_partners.sql` — no-op after #1 (idempotent).
5. `20260521_set_pending_job_syndication_targets_add_careerjet.sql` — **new this batch**, adds `'careerjet'` to the RPC's v_known whitelist so explicit recruiter opt-ins via /post-job survive sanitization. Without this, recruiters checking the Careerjet box have their choice silently stripped.

All 5 are safe to re-run (CREATE OR REPLACE + idempotent backfills). #3 + #4 stay in the tree for audit trail.

## Post-deploy smoke tests

```
# All feeds — counts should land here:
curl -s https://freejobpost.co/feeds/indeed.xml       | grep -c '<job>'   # expect ≥425 (strict)
curl -s https://freejobpost.co/feeds/linkedin.xml     | grep -c '<job>'   # expect ≥425 (strict)
curl -s https://freejobpost.co/feeds/ziprecruiter.xml | grep -c '<job>'   # expect ≥425 (strict)
curl -s https://freejobpost.co/feeds/talent.xml       | grep -c '<job>'   # expect ≥7,300 (volume, post-thin-filter)
curl -s https://freejobpost.co/feeds/careerjet.xml    | grep -c '<job>'   # expect ≥7,300 AFTER migration #1
curl -s https://freejobpost.co/jobs.xml               | grep -c '<job>'   # expect ≥7,300

# Sitemap
curl -s https://freejobpost.co/sitemap.xml | grep -c '<loc>'              # expect ≥9,000

# Per-job page (real ATS slug — Workday uppercase)
curl -s -o /dev/null -w "%{http_code}\n" https://freejobpost.co/jobs/mammography-technologist-wd-RQ4052378
# expect 200

# Click attribution flow
curl -sI "https://freejobpost.co/click/<real-slug>?p=talent"
# expect 302 with Location: <employer ATS URL>

# Admin gate
curl -s -o /dev/null -w "%{http_code}\n" https://freejobpost.co/admin/attribution
# expect 404
curl -s -o /dev/null -w "%{http_code}\n" "https://freejobpost.co/admin/attribution?key=<the-real-key>"
# expect 200 (with the real key)

# Robots header on private surfaces
curl -sI https://freejobpost.co/admin/attribution    | grep -i x-robots-tag  # noindex, nofollow
curl -sI https://freejobpost.co/employer/login       | grep -i x-robots-tag  # noindex, nofollow
curl -sI https://freejobpost.co/                      | grep -i x-robots-tag  # index, follow

# Favicon redirect
curl -sI https://freejobpost.co/favicon.ico | head -3
# expect 308 → Location: /icon
```

Then check `apply_clicks` table after 24h:

```sql
SELECT partner, COUNT(*), COUNT(DISTINCT ip_hash) AS unique_ips, COUNT(DISTINCT job_slug) AS unique_jobs
FROM apply_clicks
WHERE created_at > now() - interval '24 hours'
GROUP BY partner
ORDER BY COUNT(*) DESC;
```

First non-zero `partner='talent'` / `'adzuna'` / `'jooble'` row is the signal that a partner has successfully ingested + a candidate has clicked through.

## Post-deploy: redeploy the ATS edge function

Vercel auto-deploys the Next.js side on `git push`. The Supabase Edge
Functions under `supabase/functions/` are NOT auto-deployed — they live
in a separate deploy path. After this push, redeploy two functions:

```bash
supabase functions deploy refresh-ats-imports
supabase functions deploy backfill-workday-descriptions
```

`refresh-ats-imports` picks up the new Google Indexing API integration
(commit `41c8366`) — pings Google's Indexing API for every newly-inserted
ATS job, capped 30/cycle = ~180/day total. No-op until
`GOOGLE_SERVICE_ACCOUNT_JSON` is set in Supabase Functions Secrets.

`backfill-workday-descriptions` is unchanged but worth redeploying to
make sure the latest version is running before invoking it (next section).

To set the `GOOGLE_SERVICE_ACCOUNT_JSON` secret in Supabase:

```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<paste-the-full-json>'
```

Same JSON contents as the Vercel env var with the same name — the
service account is shared by both sides.

## Post-deploy: drain the Workday description backlog

The `backfill-workday-descriptions` edge function + its SECURITY DEFINER RPCs were deployed on 2026-05-17 but never invoked operationally. ~2,300 active Workday jobs still carry empty / <300-char descriptions left over from the pre-v10 shallow-refresh era. Those rows are currently invisible to Google for Jobs (suppressed by the thin-description JobPosting JSON-LD guard) and excluded from every per-partner feed (the thin-description filter from commit `120691f`).

After Vercel deploys + migrations apply, **run this once locally**:

```bash
# Dry-run first to see what would change:
node scripts/backfill-workday-descriptions.mjs --dry-run

# Then drain the backlog for real (paces ~1 invocation/sec; ~15 min wall time
# at 2,300 candidates / 200 per invocation / 1s pacing):
node scripts/backfill-workday-descriptions.mjs
```

The script reads `.env.local` for `SUPABASE_SERVICE_ROLE_KEY` (same one the
admin dashboard uses). Expected output: ~12 invocations until `candidates`
hits 0, ~2,300 rows updated total.

After the backfill: those 2,300 jobs start emitting valid JobPosting JSON-LD
+ re-enter all per-partner feeds on the next ISR cycle (max 15 min).

## Known limitations (NOT blockers for this deploy)

- **ATS imports going forward STILL need the v10+ enrichment to keep
  populating descriptions.** The existing edge function at
  `supabase/functions/refresh-ats-imports/index.ts:373-409` ALREADY does
  this for NEW Workday rows (capped at 100/board/cron tick). So once the
  backlog is drained, the cron handles the steady state automatically.
  No further code change needed.
- **Careerjet feed empty until migration #1 applies.** Pre-migration the feed serves only 655 jobs (post-2026-05-20 ATS imports with empty `syndication_targets`). Post-migration: jumps to ~7,300 just like the other volume partners.
