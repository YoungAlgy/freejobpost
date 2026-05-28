// /feeds/specialty/<slug>.xml — RSS feed filtered to a single specialty.
// Used by niche RSS readers + sector-specific aggregators that want a
// pre-filtered stream rather than the firehose at /feeds/rss.xml.
//
// Pattern matches each specialty hub's matchPatterns against the
// specialty / role / title fields — same logic the on-site hub uses to
// decide which jobs surface. Cap at 200 most-recent matching jobs to
// keep the feed payload bounded for the long-tail reader ecosystem
// (Inoreader, Feedly, niche Reddit RSS bots).

import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { jobUrlWithUtm } from '@/lib/feed-builders'
import { SPECIALTY_HUBS, getSpecialtyHub } from '@/lib/specialty-slugs'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'

// 6h ISR: niche RSS/aggregator consumers poll hourly+ at most, so sub-hour
// regen was pure Vercel invocation cost (2026-05-28 cost pass).
export const revalidate = 21600

export async function generateStaticParams() {
  return SPECIALTY_HUBS.map((s) => ({ slug: s.slug }))
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

// Specialty .or() filter delegates to the shared helper at
// @/lib/specialty-filter. The inline copy that used to live here
// drifted from the runtime hub-page implementation; consolidating
// here means the 9-test regression suite covers the feed too.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const hub = getSpecialtyHub(slug)
  if (!hub) {
    return new Response('Not found', { status: 404 })
  }

  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(buildSpecialtyOrFilter(hub.matchPatterns))
    .order('created_at', { ascending: false })
    .limit(200)

  type RssJob = PublicJob & { updated_at: string }
  const jobs = (data ?? []) as unknown as RssJob[]
  const now = new Date().toUTCString()
  const feedTitle = `${hub.title} — freejobpost.co`
  const feedUrl = `https://freejobpost.co/feeds/specialty/${hub.slug}`
  const hubUrl = `https://freejobpost.co/specialty/${hub.slug}`

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
      <category>${escapeXml(hub.title.replace(/ Jobs$/, ''))}</category>
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
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
