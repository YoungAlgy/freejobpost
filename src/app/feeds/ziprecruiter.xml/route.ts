// ZipRecruiter Open Network XML feed (Indeed-spec compatible).
// Submit URL: ZipRecruiter Partner Program intake form.
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('ziprecruiter', 'ZipRecruiter')
}
