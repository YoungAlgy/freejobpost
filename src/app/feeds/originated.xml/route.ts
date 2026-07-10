// /feeds/originated.xml — strict-partner publisher feed.
//
// Includes only jobs that ORIGINATED on freejobpost (is_ats_import = false):
// the Ava Health seeded set + any future employer-posted via /post-job.
// Excludes ATS-imported jobs (Workday tenants, Greenhouse, Lever, Ashby,
// USAJobs) because strict partners — Indeed, LinkedIn Limited Listings,
// ZipRecruiter Publisher Program — quality-score republished content
// downward and may de-list aggregator feeds.
//
// Submit URL: https://freejobpost.co/feeds/originated.xml
//
// Hand to:
//   - Indeed paid feed (Appcast / Pandologic broker)
//   - LinkedIn Limited Listings (requires Talent Solutions seat)
//   - ZipRecruiter Publisher Program
//
// Volume-friendly partners (Talent.com, Adzuna, Jooble, Careerjet,
// Glassdoor) use the per-partner feeds at /feeds/<partner>.xml which do
// their own dedup and welcome larger inventories.

import { buildOriginatedFeed } from '@/lib/feed-builders'

// force-dynamic (2026-07-09): this feed pulls the active-job corpus via ~60
// batched Supabase queries (small originated subset today, but the same
// build-time batch machinery). Prerendering it at build time is what crossed
// Next's static-generation timeout / 2MB data-cache item limit on the heavier
// sibling feeds and failed the whole production deploy after 3 retries.
// Rendering it per-request keeps it out of the build. The response's own
// Cache-Control header (s-maxage=21600 = 6h) is the real caching lever.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return buildOriginatedFeed('Originated')
}
