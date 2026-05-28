// Adzuna XML feed (Indeed-spec compatible — Adzuna's partner crawler
// reads the standard Indeed v2 envelope).
// Submit URL: https://www.adzuna.com/partners.html → "Submit your jobs feed"
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// 6h ISR: partners re-crawl every 4–24h, so sub-hour regen was pure Vercel
// invocation cost (2026-05-28 cost pass). See jobs.xml for full rationale.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('adzuna', 'Adzuna')
}
