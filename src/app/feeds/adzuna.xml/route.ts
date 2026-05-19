// Adzuna XML feed (Indeed-spec compatible — Adzuna's partner crawler
// reads the standard Indeed v2 envelope).
// Submit URL: https://www.adzuna.com/partners.html → "Submit your jobs feed"
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('adzuna', 'Adzuna')
}
