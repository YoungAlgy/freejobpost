# FreeJobPost

**A free nursing and allied-health job board for direct employer posts.**

**Status: In development. Public intake is paused.**

**Project URL:** [freejobpost.co](https://freejobpost.co)

## Product scope

These points describe product scope and local development work. Hosted acceptance remains outstanding.

- Email-verified employers post nursing and allied-health jobs for free.
- Candidates browse direct employer listings and apply through the employer's chosen route.
- Employers manage their posts and native applications from a private dashboard.
- Public job pages include sitemaps and JobPosting structured data.
- The public product is limited to `public_employer_post` inventory. Imported and federal inventory is outside the current public scope.

## Connected applications

FreeJobPost is paired with [FreeResumePost](https://github.com/YoungAlgy/freeresumepost). Connected local work is adding explicit per-job applications using a candidate-approved profile and resume snapshot. Automatic candidate sharing and job matching are outside that workflow.

The connected workflow is held local work. Its inclusion in this public branch and deployment to the public sites remain unverified.

Public release remains held. Retention, withdrawal and cleanup rules for application copies are part of the local release work. Local workflow checks do not establish hosted policy enforcement, permissions, storage access or real email receipt.

## Architecture / stack

- **Next.js 16** (app router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres, Auth and Storage)
- **Cloudflare Workers** (via OpenNext)
- Vitest test suite

## Engineering design requirements

The public-reader design requires a direct-employer source boundary. Build-time static generation must remain read-only, including the Postgres matrix cache.

Runtime caching is intended to bound repeated hub and sitemap queries. Current paired full-build and cache acceptance remain unverified.

## Dev

```bash
npm install
cp .env.example .env.local   # add your own Supabase anon key
npm run dev                  # http://localhost:3000
```

## Release status

The repository's earlier Cloudflare deployment and rollback notes are in [`docs/DEPLOY_NOTES.md`](docs/DEPLOY_NOTES.md). Review them against the current paired release plan before use.

Deployment and database changes require a reviewed release and owner approval. Keep the public pause pages until the paired workflow, permissions, recovery and hosted acceptance checks are complete and public reopening is approved.
