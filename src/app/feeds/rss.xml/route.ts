// RSS 2.0 feed of active jobs.
//
// Used by long-tail crawlers, RSS readers (Feedly, Inoreader, Apple News),
// niche aggregators that don't accept the Indeed XML format, and Reddit-bot
// ecosystems that re-post via RSS. Includes the freejobpost custom
// extension for salary + location, plus standard atom:link for self-id.

import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { jobUrlWithUtm, isBuildPhase, hasUsableDescription, escapeXml, cdata, MIN_INDEXABLE_DESCRIPTION_CHARS } from '@/lib/feed-builders'

// 1h ISR: RSS readers (Feedly/Inoreader) poll ~hourly, so keep this one
// fresher than the 6h partner feeds, but 900s was still 4× over-regen
// (2026-05-28 cost pass).
export const revalidate = 3600

// escapeXml + cdata are imported from @/lib/feed-builders (shared across the
// RSS-spec feed routes — rss.xml, /feeds/state, /feeds/specialty).

export async function GET(): Promise<Response> {
  // Defensive: pre-migration fallback to unfiltered. Empty-array semantics
  // matches the other partner feeds — empty == "no preference set" (ATS
  // default), include in feed.
  const filtered = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, syndication_targets')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or('syndication_targets.cs.{rss},syndication_targets.eq.{}')
    .order('created_at', { ascending: false })
    .limit(500)

  let data: unknown[] | null = filtered.data
  if (filtered.error) {
    const fallback = await supabase
      .from('public_jobs')
      .select(JOB_DETAIL_FIELDS + ', updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', hourIso())
      .order('created_at', { ascending: false })
      .limit(500)
    data = fallback.data
  }

  type RssJob = PublicJob & { updated_at: string }
  const allJobs = (data ?? []) as unknown as RssJob[]
  // FAIL CLOSED, RUNTIME ONLY — see feed-builders.ts isBuildPhase. 0 fetched
  // = DB failure (always thousands of active jobs). Throw at runtime so ISR
  // serves the last-good cache; never throw at build (aborts the deploy).
  if (allJobs.length === 0 && !isBuildPhase()) {
    throw new Error('rss.xml: 0 jobs fetched — refusing to cache empty feed (likely DB saturation).')
  }
  // Skip thin-description jobs — RSS readers (Feedly / Inoreader / Apple News)
  // de-prioritize feeds full of empty/thin <description>. Reader-facing coverage
  // feed, so it uses the 250-char page-indexability floor
  // (MIN_INDEXABLE_DESCRIPTION_CHARS), matching the /jobs/[slug] noindex gate and
  // the sitemap so a job appears in this feed and on its page or nowhere. (Not
  // the 600 partner bar, which is for the strict partner submissions. Pinned
  // explicit 2026-06-15 so it can't ride the shared default.)
  const jobs = allJobs.filter((j) => hasUsableDescription(j.description, MIN_INDEXABLE_DESCRIPTION_CHARS))
  const now = new Date().toUTCString()

  const items = jobs
    .map((j) => {
      // guid stays canonical (no UTMs) so RSS readers dedupe properly.
      // link gets UTM-tagged so click-throughs are attributable to RSS.
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
    <title>freejobpost.co | Healthcare jobs</title>
    <link>https://freejobpost.co</link>
    <atom:link href="https://freejobpost.co/feeds/rss.xml" rel="self" type="application/rss+xml" />
    <description>Open healthcare roles posted on freejobpost.co: physicians, nurses, therapists, and allied health. Updated hourly.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // 6h CDN cache (was 15m) — the real lever for this dynamic (no-store)
      // route; export const revalidate is moot. swr=24h serves stale during
      // regen. 2026-05-28 cost pass.
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
