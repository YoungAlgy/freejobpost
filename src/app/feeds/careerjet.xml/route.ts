// Careerjet partner feed.
// Careerjet accepts the Indeed v2 envelope (same <source>/<job> structure).
// Submit URL: careerjet.com/admin (publisher-side; reach via form on their
// "Become a partner" page).
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('careerjet', 'Careerjet')
}
