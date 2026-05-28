// Glassdoor Native Feed (Indeed-spec compatible — Glassdoor is Indeed-owned
// and the partner team accepts the same XML).
// Submit URL: Glassdoor Partner Onboarding (gated; ask your account rep).
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

// 6h ISR: partners re-crawl every 4–24h, so sub-hour regen was pure Vercel
// invocation cost (2026-05-28 cost pass). See jobs.xml for full rationale.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('glassdoor', 'Glassdoor')
}
