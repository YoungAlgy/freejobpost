// Jooble Partner XML feed (accepts the Indeed v2 envelope; Jooble's docs
// ask for `<source>...<job>...</job></source>` which is exactly what we emit).
// Submit URL: jooble.org/api/partner → contact partners@jooble.com
import { buildIndeedFormatFeed } from '@/lib/feed-builders'

export const revalidate = 900
export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return buildIndeedFormatFeed('jooble', 'Jooble')
}
