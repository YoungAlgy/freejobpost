# freejobpost.co

**A free, two-sided healthcare hiring marketplace** — the employer side, paired with its candidate-side sibling [freeresumepost.co](https://github.com/YoungAlgy/freeresumepost). Built and operated solo.

🔗 **Live:** [freejobpost.co](https://freejobpost.co)

## What it does
- **Thousands of active job listings**, kept fresh via **reciprocal ATS bridging** — pulls and normalizes postings across **Greenhouse, Lever, and Workday** APIs into one schema.
- **Two-sided marketplace:** employers post here; candidates live on the sibling app; the two cross-match.
- **SEO-first architecture** — indexable per-job pages, sitemaps, structured data — built to rank, not just exist.
- Email-verified employer post flow, authed employer dashboard, public search + filtering.

## Architecture / stack
- **Next.js 16** (app router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (Postgres + auth + storage), row-level security throughout
- **Vercel** (ISR-tuned for cost at listing scale)
- Vitest test suite

## Engineering notes
- The interesting problem here is **heterogeneous-source normalization**: Greenhouse, Lever, and Workday each model jobs differently — the ingestion layer maps all three into one canonical schema, with dedup + idempotent re-runs so refreshes don't double-write.
- ISR revalidation windows tuned per source to balance freshness against serverless cost across thousands of pages.

## Dev
```bash
npm install
cp .env.example .env.local   # add your own Supabase anon key
npm run dev                  # http://localhost:3000
```

## Related
- [freeresumepost.co](https://github.com/YoungAlgy/freeresumepost) — the candidate side of the marketplace
- Part of a broader healthcare-data + hiring stack I build and operate solo. More at [youngalgy.com](https://youngalgy.com).
