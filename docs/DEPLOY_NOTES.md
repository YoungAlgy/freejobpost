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
```

Total: 16 commits, no breaking schema changes, fully backward-compatible.

## Vercel env vars to set BEFORE first deploy

Both server-side only. Mark as not-public in Vercel project settings.

| Var | Why | How to generate |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `/admin/attribution` reads `partner_attribution_daily` via service-role to bypass RLS | Supabase Dashboard → Project Settings → API → service_role key |
| `ADMIN_DASHBOARD_KEY` | Query-param gate for `/admin/attribution?key=…` | `openssl rand -hex 24` once, bookmark the URL+key combo |

If either is missing, `/admin/attribution` 404s rather than 500ing — no information leakage. So a partial deploy is safe; the dashboard just won't work until both are set.

## Supabase migrations to apply

Run via `supabase db push` or apply manually in the SQL editor. Order matters (alphabetical date prefix):

1. `20260520_ats_import_syndication_targets_default.sql` — **new today**, fixes `ats_import_upsert_jobs` RPC default + backfills 655 empty rows + catches up 8,961 rows with `careerjet`.
2. `20260520_partner_attribution_daily_view.sql` — `partner_attribution_daily` view powering `/admin/attribution`.
3. `20260520_syndication_targets_add_careerjet.sql` — no-op after #1 (idempotent).
4. `20260520_syndication_targets_backfill_volume_partners.sql` — no-op after #1 (idempotent).

All 4 are safe to re-run. The catch-up logic in #1 makes #3 + #4 redundant; they remain in the tree for the audit trail.

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

## Known limitations (NOT blockers for this deploy)

- **Workday ATS importer doesn't enrich descriptions on shallow refresh** (`src/lib/ats-import/workday.ts:212-224`). 2,300 active jobs have empty descriptions and are filtered out of partner feeds. Tracked as a follow-up — requires editing the edge function `refresh-ats-imports` to default `enrichAll` to `true` for new rows, plus a one-shot backfill RPC for existing thin rows.
- **Careerjet feed empty until migration #1 applies.** Pre-migration the feed serves only 655 jobs (post-2026-05-20 ATS imports with empty `syndication_targets`). Post-migration: jumps to ~7,300 just like the other volume partners.
