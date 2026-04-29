// Indeed Free Organic XML feed.
// Submit URL: https://employers.indeed.com/p/resources/free-posting
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('indeed', 'Indeed')
}
