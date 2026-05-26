# Deploy: USAJobs fuller-description fix

**Commit:** `76d1698` — `feat(usajobs): build full description from rich Search-API fields`

**Goal:** recover 424 thin federal jobs (VA / IHS / DoD / HHS) into Google for Jobs + every partner feed by switching the importer from `JobSummary` (50-300 chars) to a concatenation of `JobSummary + MajorDuties + Qualifications + Requirements + KeyRequirements + Education` (~1500-3500 chars).

## What's already done

- ✅ Source change committed to repo (`76d1698`)
- ✅ Pushed to origin/main
- ✅ Tests pass (185/185), tsc clean
- ✅ Vercel auto-deployed the Next.js side (no impact — this is server-side only)
- ❌ Edge function **not yet deployed** to Supabase

## Why the edge function deploy is manual

The `refresh-ats-imports` edge function is **the** ATS importer cron. It runs every 4 hours and writes new jobs to `public_jobs`. The Vercel deploy didn't touch it — Supabase edge functions deploy independently.

## One-command deploy (recommended)

The repo has `scripts/deploy_edge_function.mjs` which uses the Supabase Management API. Requires a Personal Access Token.

### Step 1: Get a PAT (one-time)

Visit https://supabase.com/dashboard/account/tokens → "Generate new token" → name it something like `freejobpost-deploys`. Copy the token (shown once).

### Step 2: Deploy

```bash
cd /c/Users/Algy/freejobpost
SUPABASE_PAT='<the-pat-from-step-1>' node scripts/deploy_edge_function.mjs \
  refresh-ats-imports \
  supabase/functions/refresh-ats-imports/index.ts \
  --include _google-indexing.ts
```

(Note: `--no-verify-jwt` is NOT needed — refresh-ats-imports is invoked by cron with the `X-Cron-Token` header, not by client browsers, so default `verify_jwt: true` is correct.)

Expected output: a JSON response with `version: <next>` and `status: ACTIVE` + a confirmation line:
```
Function refresh-ats-imports now at version <N>, status ACTIVE, verify_jwt=true
```

## What happens after the deploy

1. The cron schedule (`refresh-ats-imports-cron` — every 4 hours) automatically picks up the new function version on its next run.
2. On that next run, the function re-fetches all ~5,000 federal jobs from USAJobs API.
3. For each job, the importer now builds a fuller description by concatenating rich fields.
4. The `ats_import_upsert_jobs` RPC overwrites `description` on `ON CONFLICT (external_ref)`.
5. All 424 currently-thin federal jobs get rewritten with full descriptions.
6. On the next sitemap regeneration (≤1 hour), those 424 URLs become Google-for-Jobs eligible.

## Verifying the deploy worked

```sql
-- Run in Supabase SQL editor 30-60 min after deploy + cron run.
-- Expected: still_thin should drop from 3,103 → ~2,700-2,800 (424 fewer).
SELECT
  count(*) AS total_ats_jobs,
  count(*) FILTER (WHERE length(coalesce(regexp_replace(description, E'<[^>]+>', '', 'g'), '')) >= 250) AS with_full_description,
  count(*) FILTER (WHERE length(coalesce(regexp_replace(description, E'<[^>]+>', '', 'g'), '')) < 250) AS still_thin
FROM public_jobs
WHERE status = 'active'
  AND deleted_at IS NULL
  AND expires_at > now()
  AND is_ats_import = true;
```

Or check just the federal subset:
```sql
SELECT
  count(*) AS total_federal,
  count(*) FILTER (WHERE length(coalesce(regexp_replace(description, E'<[^>]+>', '', 'g'), '')) >= 250) AS with_full_description
FROM public_jobs
WHERE status = 'active'
  AND deleted_at IS NULL
  AND expires_at > now()
  AND source = 'usajobs:federal';
```

## Alternative: deploy via Supabase Dashboard

If you'd rather avoid the CLI:

1. Open https://supabase.com/dashboard/project/tsruqbodyrmxqzhvxret/functions/refresh-ats-imports
2. Click "Deploy a new version"
3. Upload `supabase/functions/refresh-ats-imports/index.ts` as the entrypoint
4. Add `_google-indexing.ts` as an additional file
5. Leave `verify_jwt` enabled (default)
6. Deploy

Same effect.

## Why I didn't deploy this via the MCP tool myself

The function source is 839 lines / 44 KB. Inlining that through the `deploy_edge_function` MCP tool would require constructing a tool call payload with the entire file as a JSON-escaped string. Risk of silent corruption (escape errors in template literals, regex patterns, etc.) outweighs the value of saving you 30 seconds. The script does the right thing.
