// Glassdoor Native Feed (Indeed-spec compatible — Glassdoor is Indeed-owned
// and the partner team accepts the same XML).
// Submit URL: Glassdoor Partner Onboarding (gated; ask your account rep).
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('glassdoor', 'Glassdoor')
}
