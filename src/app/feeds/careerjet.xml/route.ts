// Careerjet partner feed.
// Careerjet accepts the Indeed v2 envelope (same <source>/<job> structure).
// Submit URL: careerjet.com/admin (publisher-side; reach via form on their
// "Become a partner" page).
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// 6h ISR: partners re-crawl every 4–24h, so sub-hour regen was pure Vercel
// invocation cost (2026-05-28 cost pass). See jobs.xml for full rationale.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('careerjet', 'Careerjet')
}
