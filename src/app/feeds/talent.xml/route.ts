// Talent.com (formerly Neuvoo) XML feed.
// Indeed-spec compatible — Talent.com's partner ingest reads the same
// <source><job>...</job></source> envelope.
// Submit URL: https://www.talent.com/syndicate → partner@talent.com
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// force-dynamic (2026-07-09): this feed pulls the full active-job corpus via
// ~60 batched Supabase queries and serializes multi-MB XML. Prerendering it at
// build time crossed Next's static-generation timeout / 2MB data-cache item
// limit and failed the whole production deploy after 3 retries. Rendering it
// per-request keeps it out of the build. The response's own Cache-Control
// header (s-maxage=21600 = 6h) is the real caching lever partners hit, exactly
// as the builder already assumes. Partners re-crawl every 4-24h.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('talent', 'Talent.com')
}
