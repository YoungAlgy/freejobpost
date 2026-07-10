// /feeds/state/<slug>.xml — RSS feed filtered to a single state.
// Sibling of /feeds/specialty/<slug>.xml. Used by RSS readers + niche
// aggregators that want jobs filtered to a single state's market.

import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { jobUrlWithUtm, hasUsableDescription, escapeXml, cdata, isBuildPhase, MIN_INDEXABLE_DESCRIPTION_CHARS } from '@/lib/feed-builders'
import { getStateHub } from '@/lib/state-slugs'

// force-dynamic (2026-07-09): this per-state RSS feed used to prerender all 52
// states at build (generateStaticParams), each running a full-column select
// over the active corpus. Once the heavier partner feeds moved off the build,
// these 52 (plus the 35 specialty feeds) were the remaining heavy build-time DB
// queries and pushed pages past the static-generation timeout under concurrent
// build-worker load. Render per-request instead: these are machine-read feeds
// (not indexable pages, not in the sitemap), and the response's Cache-Control
// (s-maxage=21600 = 6h) is the real caching lever. Any valid state slug still
// resolves on demand.
export const dynamic = 'force-dynamic'

// escapeXml + cdata are imported from @/lib/feed-builders (shared across the
// RSS-spec feed routes).

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const hub = getStateHub(slug)
  if (!hub) {
    return new Response('Not found', { status: 404 })
  }

  const { data, error } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at')
    .eq('status', 'active')
    .eq('state', hub.abbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .order('created_at', { ascending: false })
    .limit(200)

  // FAIL CLOSED on a DB ERROR only (not on a legitimately-empty state). A real
  // empty state renders an empty feed, which is correct. A transient DB failure
  // throws so ISR serves the last-good cache instead of caching emptiness.
  // Runtime-only: never throw at build (it would abort the deploy).
  if (error && !isBuildPhase()) {
    throw new Error(`state feed ${slug}: query failed, refusing to cache. ${error.message}`)
  }

  type RssJob = PublicJob & { updated_at: string }
  // Reader-facing coverage feed: filter to the 250-char page-indexability floor
  // (MIN_INDEXABLE_DESCRIPTION_CHARS), the same gate as /jobs/[slug] noindex and
  // the sitemap. Not the 600 partner bar. Pinned explicit 2026-06-15 so this
  // niche RSS surface can't ride the shared default.
  const jobs = ((data ?? []) as unknown as RssJob[]).filter((j) =>
    hasUsableDescription(j.description, MIN_INDEXABLE_DESCRIPTION_CHARS),
  )
  const now = new Date().toUTCString()
  const feedTitle = `${hub.name} healthcare jobs | freejobpost.co`
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
      <title>${escapeXml(titleParts.join(' | '))}</title>
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
