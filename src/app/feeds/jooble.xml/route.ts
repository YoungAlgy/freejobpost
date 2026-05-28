// Jooble Partner XML feed (accepts the Indeed v2 envelope; Jooble's docs
// ask for `<source>...<job>...</job></source>` which is exactly what we emit).
// Submit URL: jooble.org/api/partner → contact partners@jooble.com
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// 6h ISR: partners re-crawl every 4–24h, so sub-hour regen was pure Vercel
// invocation cost (2026-05-28 cost pass). See jobs.xml for full rationale.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('jooble', 'Jooble')
}
