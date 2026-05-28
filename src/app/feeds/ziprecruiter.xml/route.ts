// ZipRecruiter Open Network XML feed (Indeed-spec compatible).
// Submit URL: ZipRecruiter Partner Program intake form.
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// 6h ISR: partners re-crawl every 4–24h, so sub-hour regen was pure Vercel
// invocation cost (2026-05-28 cost pass). See jobs.xml for full rationale.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('ziprecruiter', 'ZipRecruiter')
}
