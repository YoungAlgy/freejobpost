# Cloudflare release runbook - freejobpost.co

**Current as of 2026-08-31.** This runbook covers the standalone,
direct-employer release. Free Job Post runs on Cloudflare Workers through
OpenNext. Supabase migrations and Edge Functions use a separate release path.

## Release scope

This release includes:

- Public pages, search, feeds, sitemaps, applications, alerts, expiry handling,
  and employer tools scoped to `public_employer_post` jobs.
- Ava-family vanity redirects removed from the Free Job Post Worker.
- Production builds blocked from calling `set_matrix_cache`.
- `20260828_scope_employer_applications_to_direct_posts.sql` applied to the
  shared Supabase project. It scopes employer application reads and public
  application writes to direct-employer jobs.
- The five active application, verification, login, and alert Edge Functions
  deployed with direct-employer checks and FreeJobPost-owned email bindings.

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
- Full lint and the scoped diff check pass.
- The release source is one clean reviewed commit. Staged or unstaged tracked
  changes fail the release. Every nonignored untracked path also fails except
  the exact root path `_migrate_data.mjs` described below.
- The previous Cloudflare Worker version ID is recorded.
- The migration and Edge Function source in the release match the frontend.
- The submission-boundary expand source is applied before the new Worker. Its
  separate legacy-grant retirement source remains held until the new Worker is
  verified at 100 percent, old requests have drained, and the prior-Worker
  rollback window is explicitly closed.
- The three required public build values are present in the current process.
  The release build receives no other app environment values and copies no
  `.env` file.
- `NEXT_PUBLIC_SUPABASE_URL` is exactly
  `https://tsruqbodyrmxqzhvxret.supabase.co`. The public key is either an
  `sb_publishable_` key or a legacy JWT whose `role` is `anon` and whose `ref`
  is `tsruqbodyrmxqzhvxret`. An `sb_secret_` key fails the release. Before any
  build starts, the wrapper makes one read-only request to that exact project's
  `/auth/v1/settings` endpoint using only the supplied `apikey` header. A
  rejection, redirect, network failure, or five-second timeout fails closed.
- The generated Worker exports `DOQueueHandler`, and the Wrangler dry run
  succeeds after the parsed JSONC proves all five bindings have the reviewed
  resource type and identity.
- The artifact's sanitized-build provenance fingerprint matches every file in
  `.open-next`.
- The provenance matches the current source commit and tree, the SHA-256 of
  `package-lock.json`, and the exact installed Next, OpenNext, and Wrangler
  versions. The release's module and JSONC parsers are pinned and checked too.
  Each installed version must match `package-lock.json`.
- `NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL` is supplied as a monitored
  `freejobpost.co` build value. The sanitized build validates and embeds it.
  It is deliberately absent from the exact runtime Worker-binding inventory.
- `FREEJOBPOST_FROM_EMAIL` and `FREEJOBPOST_REPLY_TO_EMAIL` are set for each
  listed Edge Function. Both domains are exactly `freejobpost.co`, and the
  sender is verified in Resend.

The protected root migration helper is outside this release. The wrapper uses
Git metadata to prove that the exact root path `_migrate_data.mjs` is untracked
and excludes only that path. It fails if that path becomes tracked or if any
other nonignored untracked path exists. Do not inspect, stage, copy, move, or
delete the helper. The exclusion and its exact path are recorded in artifact
provenance and checked again before preview, upload, or promotion.

## 1. Local verification

Run these from the repository root:

```powershell
npx vitest run src/test/sanitized-cloudflare-release.test.ts src/lib/db-cache.test.ts
npm test
npx tsc --noEmit
npm run lint
git diff --check -- src public docs scripts supabase package.json next.config.ts open-next.config.ts wrangler.jsonc
```

The two focused build-write tests must pass. Next sets
`NEXT_PHASE=phase-production-build` before its static workers start. The
sanitized release wrapper also sets `FREEJOBPOST_RELEASE_BUILD=1` for every
child process. Either marker keeps `getOrComputeCached` from reaching
`set_matrix_cache`. Runtime requests have neither marker and keep normal
Postgres cache writes.

The regular Next build removes `.next/cache/fetch-cache` first. The Cloudflare
release build starts in a new isolated directory, so it has no prior fetch
cache or OpenNext output to reuse. This keeps stale or malformed data-cache
files out of a new Worker. Stop if OpenNext reports a fetch-cache JSON parse
warning.

## 2. Database preflight

Use the approved read-only connection to record:

- Current deployed migration ledger.
- Current function definition for
  `public.get_employer_applications_rpc(uuid, text)`.
- Current function definition and privileges for
  `public.apply_to_job_rpc(uuid, text, text, text, text, text, text)`.
- Counts in `public_jobs` grouped by `source` and `status`.
- Count of applications joined to jobs outside `public_employer_post`.
- Existing schedule and deployed version for `job-alert-digest`.

Review the migration file directly:

`supabase/migrations/20260828_scope_employer_applications_to_direct_posts.sql`

It replaces two RPCs and does not delete or rewrite jobs, candidates, or
applications. The dashboard response shape stays compatible and adds
`scope: "public_employer_post"`. The public apply signature and response shape
stay compatible while imported, federal, and seeded job IDs return 404 before
any candidate or application write.

The standalone posting RPC is a separate two-stage rolling change. Review both
held sources directly:

```text
supabase/migration-sources/held/20260830230000_freejobpost_submission_boundary.sql
supabase/migration-sources/held/20260830231500_freejobpost_retire_legacy_submission_grants.sql
```

After a fresh backup and the normal ledger checks, apply only the first source.
It adds `submit_freejobpost_job_rpc` while leaving the old Worker's two RPC
grants unchanged. Confirm both old and new function paths are callable with
their expected roles before building the Worker. Keep the retirement source
held through the deploy, smoke test, traffic move, and request-drain window.
Apply it only after proving the old Worker can no longer receive traffic and
explicitly closing the rollback window for that version.

Run the existing migration dry-run workflow. Apply only this reviewed pending
migration when its plan matches the file. Read the function definition again
afterward and confirm the dashboard joins and apply job lookup require the
equivalent source gates:

```sql
pj.source = 'public_employer_post'
source = 'public_employer_post'
```

Confirm the apply RPC has no grant for `PUBLIC` or `authenticated`, and only
`anon` has execute access for the public server action.

## 3. Edge Functions

Confirm the sender and reply bindings in the Supabase dashboard without
printing their values. Use a reviewed Supabase CLI version and pin every
command to project `tsruqbodyrmxqzhvxret`. Deploy the five reviewed functions
without JWT verification. Their own request checks stay in place:

```powershell
supabase functions deploy apply-notify --project-ref tsruqbodyrmxqzhvxret --no-verify-jwt
supabase functions deploy employer-login-send --project-ref tsruqbodyrmxqzhvxret --no-verify-jwt
supabase functions deploy job-alert-digest --project-ref tsruqbodyrmxqzhvxret --no-verify-jwt
supabase functions deploy post-job-send-verify --project-ref tsruqbodyrmxqzhvxret --no-verify-jwt
supabase functions deploy post-job-verify --project-ref tsruqbodyrmxqzhvxret --no-verify-jwt
```

Do not trigger these functions during deployment. Verify the deployed source
or function metadata, then leave the existing digest schedule unchanged.

## 4. Safe production builds

Run the focused build-write test immediately before the release build. A build
can read current direct-employer listing data for prerendering. The two build
markers prevent Postgres cache writes.

Load only these reviewed public values into the current process without
printing them:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL
```

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is also passed when present. No server secret
is accepted by the release wrapper. The Auth settings probe proves online that
the supplied public key belongs to the pinned project. The key is never placed
in the URL, response output, provenance, or log messages. After that proof, the
wrapper checks out the reviewed Git index into
an isolated directory, links the installed dependencies, copies no `.env`
file, builds OpenNext there, checks the Durable Object export, and runs
Wrangler with `--dry-run`. A staged change fails before this checkout, so the
index still matches the recorded commit tree. Working-tree files marked with
Git's skip or assume-unchanged flags cannot leak into the build. It
fingerprints every generated file and records the public-only build policy in
the artifact. Provenance also records the clean source commit and tree,
`package-lock.json` SHA-256, the exact installed Next, OpenNext, and Wrangler
versions, the exact release-parser versions, and the one protected untracked
exclusion when present. The lockfile bytes used for the digest and version
inventory come from `HEAD`, never the live working-tree file. The build repeats
the clean source, commit, tree, committed lock, installed tool, staged lock, and
artifact checks after the network proof, after the build, before provenance is
written, and after the artifact is installed. The check command recomputes and
compares those values before it accepts an artifact. Preview and zero-traffic
upload copy the reviewed Git source and exact artifact into a private isolated
workspace, run the full check there, and invoke OpenNext from that same
workspace. They do not
use a separate shell command after the check, do not load repository `.env`
files, and reject extra command arguments that could retarget the action.
Remote release commands also require Cloudflare authentication in the current
process. The wrapper carries only the allowlisted Cloudflare authentication
variables into its child process, pins account
`faf641f1b778a8e0bd365c5141da649d`, and rejects a conflicting account value.

```powershell
npx vitest run src/lib/db-cache.test.ts
npm run cf:source-check
npm run cf:build
npm run cf:check
```

Hold the release if the build reports a Supabase timeout, missing required
data, a `set_matrix_cache` call, a fetch-cache parse warning, a missing
`DOQueueHandler` export, an unresolved binding, or a static-generation failure.
Do not use OpenNext's `--skipNextBuild` flag for a release. A plain `npm run
build` can still be used as a local Next diagnostic, but it is not a release
artifact and it auto-loads local environment files.

## 5. Preview

Use the already-built OpenNext output. The wrapper verifies and previews an
isolated copy of that exact artifact:

```powershell
npm run cf:preview
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

## 6. Record rollback target and upload a zero-traffic candidate

Prove that Wrangler is logged into the pinned FreeJobPost Cloudflare account,
that every active production version has the exact reviewed binding names,
types, cache resources, same-script Durable Object, production self-service
target, and required secret names, then record the current production version:

```powershell
npm run release:bindings
```

Save the active version ID from the check in the release log. Upload the exact checked OpenNext
output only after the preview passes. The wrapper verifies an isolated copy,
rechecks the active remote resource inventory, uses the fixed `upload --strict
--keep-vars` action, parses one exact immutable version ID, and checks that
candidate remotely. It also proves the deployment snapshot did not change and
writes an ignored local record tying the candidate to the checked source and
artifact. It does not rebuild and it changes no production traffic:

```powershell
npm run cf:upload
```

Stop if the wrapper cannot parse exactly one candidate UUID or if the explicit
candidate check returns another version, account, binding, type, or resource.
Secret values still require the separate owner-side scope check.

After approval, put the checked candidate beside the recorded production
version at zero percent:

```powershell
npm run cf:stage -- --current <old-version-id> --candidate <new-version-id>
```

The staging wrapper accepts only those two UUIDs in that order. It uses the
locked Wrangler binary, pinned account, pinned Worker name, isolated config,
recorded candidate, exact remote bindings, and an unchanged 100 percent active
version before it creates the 100/0 deployment. It then verifies the resulting
traffic split and both versions again.

Smoke the candidate through `https://freejobpost.co` with
`Cloudflare-Workers-Version-Overrides: freejobpost="<new-version-id>"`. Apply
the header to document, asset, and Server Action requests. Confirm the invoked
version in Cloudflare observability. Ordinary users must remain on the old
version during this check.

If the zero-traffic smoke fails, remove the candidate through the locked path:

```powershell
npm run cf:unstage -- --current <old-version-id> --candidate <new-version-id>
```

The unstage wrapper requires the recorded candidate and the exact 100/0 traffic
state, repeats the final source, artifact, account, Worker, binding, and traffic
checks, then restores the old version as the only 100 percent deployment. It
also verifies the result after any success or uncertain Wrangler response. Do
not promote a failed candidate. After unstage succeeds, build and upload the
replacement from a newly reviewed clean commit.

Promote only through the same checked wrapper. It repeats the source, artifact,
account, Worker, binding, candidate-record, and 100/0 traffic checks immediately
before routing traffic to the recorded candidate UUID:

```powershell
npm run cf:promote -- --current <old-version-id> --candidate <new-version-id>
```

## 7. Production smoke tests

Repeat the preview paths against `https://freejobpost.co`. Also confirm:

- A public search result and every sitemap job URL use
  `public_employer_post` inventory.
- A direct employer can open the dashboard and see only applications to their
  direct posts.
- Imported or federal job IDs do not render as public job detail pages.
- No public navigation or metadata promotes Ava CRM. FreeResumePost appears
  only in the approved sister-site links in the main navigation, home page,
  healthcare-tools navigation, layout metadata, and `public/llms.txt`.
- No application or digest error spike appears in the first 15 minutes.
- Response times stay near the pre-release baseline.

Keep the release open for a 15-minute watch. Record errors, latency, and the
final Worker version ID.

## Rollback

### Worker rollback

The recorded version remains a compatible rollback target while the legacy
submission grants are still present. Keep the retirement source held through
the full production watch.

Send 100 percent of traffic back to the recorded version:

```powershell
npm run cf:rollback -- --current <new-version-id> --previous <previous-version-id>
```

The rollback wrapper accepts only the two recorded UUIDs, repeats the same
source, artifact, account, Worker, binding, and traffic checks, and verifies the
previous version at 100 percent after the change. Smoke-test the previous
version after traffic changes.

After the legacy-grant retirement source is applied, the prior Worker cannot
post jobs. Before routing traffic back to it, restore the exact old grants from
the pre-retirement capture. A Worker rollback without that database step will
break employer submissions.

### Edge Function rollback

Redeploy the prior reviewed source for the affected Edge Function if the new
function fails. Do not change the digest schedule during a code rollback.

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
