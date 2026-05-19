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

export const revalidate = 900

export async function GET(): Promise<Response> {
  return buildOriginatedFeed('Originated')
}
