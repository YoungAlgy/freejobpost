# Deploy notes — freejobpost.co

Pre-push checklist for the next Vercel deploy. Locked overnight on 2026-05-21; reflects every local-only change since `origin/main`.

## Commits ready to push (oldest → newest)

```
42d9c5e  feat(careerjet): add Careerjet as 4th volume-friendly partner channel
993a2a5  feat(admin): partner-attribution dashboard at /admin/attribution
bc7dfe0  docs(ally): update status doc with 2026-05-20 partner-submission results
94997ca  fix(syndication): empty-array semantics + strict-partner refinement
120691f  fix(feeds): filter thin-description jobs from partner feeds + JSON-LD
0ddf7e1  fix(seo): close X-Robots-Tag conflicts on /admin + /employer
a484171  fix(seo): /favicon.ico → /icon redirect
7b33f20  docs(changelog): catch up on user-visible ships since 2026-05-13
885e423  docs(deploy): pre-push checklist for the freejobpost batch
d7bede2  fix(seo): add og:image + twitter:image to /jobs listing
f37e33f  fix(seo): robots.txt — disallow /admin/ and /click/
3cff623  fix(security): disable X-Powered-By header (info-leak hardening)
faf8289  docs(deploy): refresh manifest after the 3 trailing SEO fixes
cb38034  deps: npm audit fix — bump ws + brace-expansion to patched versions
4d6a2d9  fix(admin): partner_attribution_daily view recognizes service_role
ed33648  docs(migration): update partner_attribution_daily COMMENT
503c622  docs(deploy): refresh commit manifest after admin view fix
0851715  fix(attribution): unify partner allowlist between /jobs.xml and /jobs/[slug]
cb234b1  fix(seo): opengraph-image SLUG_RE — allow uppercase
7937f72  fix(perf): unify NUM_BATCHES → 12 across /jobs, sitemap, matrix
17a2eb9  fix(rpc): add 'careerjet' to set_pending_job_syndication_targets v_known
9a3c4c1  refactor(jobs.xml): dedupe XML helpers — import from feed-builders
d2be7cc  fix(content): stale 850K stat on /post-job → 1.4M+ (canonical)
42c9f5a  docs(deploy): refresh after Pass 9 (3 new fixes + 1 new migration)
9089a13  fix(seo): tighten oversized meta descriptions + lang=en-US
9adc165  feat(seo): ItemList JSON-LD on every hub page
3e52cfa  feat(seo): BROWSE MORE hub-links section on every per-job page
e4d1936  feat(seo): expose 30 direct hub links on homepage (was 0)
45a54b7  feat(seo): sitewide "Popular" hub-link row in footer
```

Total: 29 commits, no breaking schema changes, fully backward-compatible.

### SEO sprint (last 5 commits in the list)

| Commit | Surface | Impact |
|---|---|---|
| `9089a13` | layout.tsx + 4 metadata blocks | `<html lang="en-US">` geo-signal; 4 meta descriptions tightened to ≤155 chars (no more SERP truncation) |
| `9adc165` | 6 hub surfaces | ItemList JSON-LD on /jobs, /specialty/[slug], /state/[slug], /jobs/federal/[agency], + both matrix surfaces. Unlocks Google category-style SERP treatment. |
| `3e52cfa` | /jobs/[slug] | New "BROWSE MORE" section linking back to specialty + state + federal hubs. Per-job pages went from **0 hub links → up to 4**. |
| `e4d1936` | homepage | 30 direct hub links (12 states + 18 specialties), 1-click from root. Up from **2** (just the index pages). |
| `45a54b7` | global footer | 9 popular-hub links sitewide. Every page now passes authority to RN, NP, PA, Family medicine, Cardiology, FL, TX, CA, Federal. |

Net effect: homepage hub-link surface went from **2 → 31**, per-job pages from **0 → 9-13**. Sitewide internal-link density up ~5×.

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
