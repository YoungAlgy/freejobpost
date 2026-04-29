// Talent.com (formerly Neuvoo) XML feed.
// Indeed-spec compatible — Talent.com's partner ingest reads the same
// <source><job>...</job></source> envelope.
// Submit URL: https://www.talent.com/syndicate → partner@talent.com
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('talent', 'Talent.com')
}
