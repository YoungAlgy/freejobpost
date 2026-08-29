# Cloudflare release runbook - freejobpost.co

**Current as of 2026-08-29.** This runbook covers the standalone,
direct-employer release. Free Job Post runs on Cloudflare Workers through
OpenNext. Supabase migrations and Edge Functions use a separate release path.

## Release scope

This release includes:

- Public pages, search, feeds, sitemaps, applications, alerts, expiry handling,
  and employer tools scoped to `public_employer_post` jobs.
- Ava-family vanity redirects removed from the Free Job Post Worker.
- Production builds blocked from calling `set_matrix_cache`.
- `20260828_scope_employer_applications_to_direct_posts.sql` applied to the
  shared Supabase project.
- `apply-notify` and `job-alert-digest` Edge Functions deployed with their
  direct-employer source checks.

Legacy ATS importers, federal inventory, candidate matching, and old backfill
jobs are outside this release. Do not redeploy or restart them as part of this
runbook.

## Hard release gates

Stop the release if any item below is false:

- The latest Supabase backup succeeded, or a fresh on-demand backup completed.
- The migration ledger is readable and its pending list is understood.
- Supabase has no active database incident or repeated connection timeout.
- The focused build-write test passes.
- Build cleanup reports that the old fetch cache and OpenNext output were
  cleared.
- The full tests and TypeScript checks pass.
- Changed-file lint and the scoped diff check pass.
- The previous Cloudflare Worker version ID is recorded.
- The migration and Edge Function source in the release match the frontend.

The protected root migration helper is outside this release. Do not include it
in inspection, staging, build helpers, or deployment commands.

## 1. Local verification

Run these from the repository root:

```powershell
npx vitest run src/lib/db-cache.test.ts
npm test -- --run
npx tsc --noEmit
npx eslint src/lib/db-cache.ts src/lib/db-cache.test.ts next.config.ts
git diff --check -- src public docs supabase package.json next.config.ts open-next.config.ts wrangler.jsonc
```

The focused test named `never writes a fresh value during a Next production
build` must pass. Next sets `NEXT_PHASE=phase-production-build` before its
static workers start. `getOrComputeCached` returns the computed value during
that phase and never reaches `set_matrix_cache`. Runtime requests have no build
phase and keep normal Postgres cache writes.

The package scripts remove `.next/cache/fetch-cache` before every Next build.
Cloudflare builds also remove `.open-next` before packaging. This keeps stale or
malformed data-cache files out of a new Worker while preserving the compiler
cache. Stop if OpenNext still reports a fetch-cache JSON parse warning.

## 2. Database preflight

Use the approved read-only connection to record:

- Current deployed migration ledger.
- Current function definition for
  `public.get_employer_applications_rpc(uuid, text)`.
- Counts in `public_jobs` grouped by `source` and `status`.
- Count of applications joined to jobs outside `public_employer_post`.
- Existing schedule and deployed version for `job-alert-digest`.

Review the migration file directly:

`supabase/migrations/20260828_scope_employer_applications_to_direct_posts.sql`

It replaces one RPC and does not delete or rewrite jobs, candidates, or
applications. Its public response shape stays compatible and adds
`scope: "public_employer_post"`.

Run the existing migration dry-run workflow. Apply only this reviewed pending
migration when its plan matches the file. Read the function definition again
afterward and confirm both job joins require:

```sql
pj.source = 'public_employer_post'
```

## 3. Edge Functions

Deploy both functions without JWT verification. Their own request checks stay
in place:

```powershell
supabase functions deploy apply-notify --no-verify-jwt
supabase functions deploy job-alert-digest --no-verify-jwt
```

Do not trigger either function during deployment. Verify the deployed source
or function metadata, then leave the existing digest schedule unchanged.

## 4. Safe production builds

Run the focused build-write test again immediately before either build. A build
can read current direct-employer listing data for prerendering. The build phase
guard prevents Postgres cache writes.

```powershell
npx vitest run src/lib/db-cache.test.ts
npm run build
npm run cf:build
```

Hold the release if either build reports a Supabase timeout, missing required
data, a `set_matrix_cache` call, a fetch-cache parse warning, or a
static-generation failure. Do not use OpenNext's `--skipNextBuild` flag for a
release. A plain Next build does not contain the standalone files OpenNext
needs.

## 5. Preview

Use the already-built OpenNext output:

```powershell
npx opennextjs-cloudflare preview
```

Check the preview on mobile and desktop:

- `/`
- `/jobs`
- `/post-job`
- `/employers`
- `/employer/login`
- One active direct-employer job and its application path
- `/sitemap.xml`
- `/jobs.xml`
- `/feeds/originated.xml`

Confirm `/resumes`, `/providers`, and `/recruiters` return the Free Job Post
404 response. They must not redirect to another product.

## 6. Record rollback target and deploy

Record the current production version before changing traffic:

```powershell
npx wrangler deployments status --json
```

Save the active version ID in the release log. Deploy the OpenNext output only
after the preview passes:

```powershell
npx opennextjs-cloudflare deploy
```

## 7. Production smoke tests

Repeat the preview paths against `https://freejobpost.co`. Also confirm:

- A public search result and every sitemap job URL use
  `public_employer_post` inventory.
- A direct employer can open the dashboard and see only applications to their
  direct posts.
- Imported or federal job IDs do not render as public job detail pages.
- No public navigation or metadata promotes Ava CRM or FreeResumePost.
- No application or digest error spike appears in the first 15 minutes.
- Response times stay near the pre-release baseline.

Keep the release open for a 15-minute watch. Record errors, latency, and the
final Worker version ID.

## Rollback

### Worker rollback

Send 100 percent of traffic back to the recorded version:

```powershell
npx wrangler versions deploy <previous-version-id>@100 --message "Rollback Free Job Post standalone release"
```

Smoke-test the previous version after traffic changes.

### Edge Function rollback

Redeploy the prior reviewed source for `apply-notify` or `job-alert-digest` if
the new function fails. Do not change the digest schedule during a code
rollback.

### Database rollback

The migration filters reads and leaves stored rows untouched. Keep it in place
during an ordinary Worker rollback. Restore the prior RPC definition only if a
confirmed compatibility failure requires it, and save the failing function
definition before replacement.

## Rollback triggers

Roll back the affected layer when any of these occurs:

- Direct job browsing, posting, applications, or the employer dashboard fails.
- A public surface exposes a job whose source is outside
  `public_employer_post`.
- An employer can read an application tied to another source or employer.
- Application notifications expose the wrong job or recipient.
- Error rate or latency rises sharply and stays above the prior baseline.
- The Worker starts returning repeated 5xx responses on core routes.
