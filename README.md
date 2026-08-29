# freejobpost.co

**A free nursing and allied-health job board for direct employer posts.** Built and operated solo.

🔗 **Live:** [freejobpost.co](https://freejobpost.co)

## What it does
- Email-verified employers post nursing and allied-health jobs for free.
- Candidates browse direct employer listings and apply through the employer's chosen route.
- Employers manage their posts and native applications from a private dashboard.
- Public job pages include sitemaps and JobPosting structured data.
- The public product is limited to `public_employer_post` inventory. Imported and federal inventory is not shown.

## Architecture / stack
- **Next.js 16** (app router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres + auth + storage), row-level security throughout
- **Cloudflare Workers** (via OpenNext)
- Vitest test suite

## Engineering notes
- Every public reader applies the same direct-employer source boundary.
- Build-time static generation can read current listing data, but it cannot write the Postgres matrix cache.
- ISR and Postgres-backed runtime caching keep repeated hub and sitemap queries bounded on Cloudflare.

## Dev
```bash
npm install
cp .env.example .env.local   # add your own Supabase anon key
npm run dev                  # http://localhost:3000
```

## Deployment

The current Cloudflare release process and rollback steps are in [`docs/DEPLOY_NOTES.md`](docs/DEPLOY_NOTES.md).
