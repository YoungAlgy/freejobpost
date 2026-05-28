// /feeds/state/<slug>.xml — RSS feed filtered to a single state.
// Sibling of /feeds/specialty/<slug>.xml. Used by RSS readers + niche
// aggregators that want jobs filtered to a single state's market.

import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { jobUrlWithUtm } from '@/lib/feed-builders'
import { STATE_HUBS, getStateHub } from '@/lib/state-slugs'

// 6h ISR: niche RSS/aggregator consumers poll hourly+ at most, so sub-hour
// regen was pure Vercel invocation cost (2026-05-28 cost pass).
export const revalidate = 21600

export async function generateStaticParams() {
  return STATE_HUBS.map((s) => ({ slug: s.slug }))
}

function escapeXml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const hub = getStateHub(slug)
  if (!hub) {
    return new Response('Not found', { status: 404 })
  }

  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at')
    .eq('status', 'active')
    .eq('state', hub.abbr)
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  type RssJob = PublicJob & { updated_at: string }
  const jobs = (data ?? []) as unknown as RssJob[]
  const now = new Date().toUTCString()
  const feedTitle = `${hub.name} healthcare jobs — freejobpost.co`
  const feedUrl = `https://freejobpost.co/feeds/state/${hub.slug}`
  const hubUrl = `https://freejobpost.co/state/${hub.slug}`

  const items = jobs
    .map((j) => {
      const guidUrl = `https://freejobpost.co/jobs/${j.slug}`
      const linkUrl = jobUrlWithUtm(j.slug, 'rss')
      const loc = locationLabel(j)
      const sal = formatSalary(j.salary_min, j.salary_max)
      const pub = j.created_at ? new Date(j.created_at).toUTCString() : now
      const titleParts = [j.title || j.role || 'Healthcare Role']
      if (loc) titleParts.push(loc)
      if (sal) titleParts.push(sal)
      const summary = (j.description ?? '').slice(0, 600).replace(/\s+/g, ' ').trim()
      return `    <item>
      <title>${escapeXml(titleParts.join(' — '))}</title>
      <link>${escapeXml(linkUrl)}</link>
      <guid isPermaLink="true">${escapeXml(guidUrl)}</guid>
      <pubDate>${pub}</pubDate>
      <category>${escapeXml(j.specialty ?? j.role ?? 'Healthcare')}</category>
      <description>${cdata(summary)}</description>
      <job:location>${escapeXml(loc)}</job:location>
      <job:salary>${escapeXml(sal ?? '')}</job:salary>
      <job:remote>${escapeXml(j.remote_hybrid ?? 'onsite')}</job:remote>
      <job:type>${escapeXml(j.employment_type ?? 'full_time')}</job:type>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:job="https://freejobpost.co/schema/job/1.0">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(hubUrl)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(hub.shortDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>15</ttl>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // 6h CDN cache (was 15m) — real lever for this dynamic (no-store) route.
      // 2026-05-28 cost pass.
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
