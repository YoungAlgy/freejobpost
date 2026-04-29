// RSS 2.0 feed of active jobs.
//
// Used by long-tail crawlers, RSS readers (Feedly, Inoreader, Apple News),
// niche aggregators that don't accept the Indeed XML format, and Reddit-bot
// ecosystems that re-post via RSS. Includes the freejobpost custom
// extension for salary + location, plus standard atom:link for self-id.

import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'

export const revalidate = 900
export const dynamic = 'force-static'

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

export async function GET(): Promise<Response> {
  // Defensive: pre-migration fallback to unfiltered.
  const filtered = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, syndication_targets')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .contains('syndication_targets', ['rss'])
    .order('created_at', { ascending: false })
    .limit(500)

  let data: unknown[] | null = filtered.data
  if (filtered.error) {
    const fallback = await supabase
      .from('public_jobs')
      .select(JOB_DETAIL_FIELDS + ', updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(500)
    data = fallback.data
  }

  type RssJob = PublicJob & { updated_at: string }
  const jobs = (data ?? []) as unknown as RssJob[]
  const now = new Date().toUTCString()

  const items = jobs
    .map((j) => {
      const url = `https://freejobpost.co/jobs/${j.slug}`
      const loc = locationLabel(j)
      const sal = formatSalary(j.salary_min, j.salary_max)
      const pub = j.created_at ? new Date(j.created_at).toUTCString() : now
      const titleParts = [j.title || j.role || 'Healthcare Role']
      if (loc) titleParts.push(loc)
      if (sal) titleParts.push(sal)
      const summary = (j.description ?? '').slice(0, 600).replace(/\s+/g, ' ').trim()
      return `    <item>
      <title>${escapeXml(titleParts.join(' — '))}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
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
    <title>freejobpost.co — Healthcare jobs</title>
    <link>https://freejobpost.co</link>
    <atom:link href="https://freejobpost.co/feeds/rss.xml" rel="self" type="application/rss+xml" />
    <description>Free, verified healthcare job openings from US employers. Updated every 15 minutes.</description>
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
