// Indeed v2 + Google for Jobs + ZipRecruiter compatible XML job feed.
//
// Feed URL:
//   https://freejobpost.co/jobs.xml             — generic (attribution=internal)
//   https://freejobpost.co/jobs.xml?ref=talent  — partner-attributed (talent, adzuna, jooble, etc.)
//
// Submit the partner-attributed variant to each publisher:
//   - Talent.com:  /jobs.xml?ref=talent
//   - Adzuna:      /jobs.xml?ref=adzuna
//   - Jooble:      /jobs.xml?ref=jooble
//   - Careerjet:   /jobs.xml?ref=careerjet
//   - Glassdoor:   /jobs.xml?ref=glassdoor
//   - ZipRecruiter:/jobs.xml?ref=ziprecruiter
//   - LinkedIn:    /jobs.xml?ref=linkedin
//
// The ref token is templated into every <url> as ?ref=<partner>, which the
// /jobs/[slug] page reads and passes to /click/[slug] for per-partner
// attribution in apply_clicks. Without the param, traffic registers as
// "internal" — fine for Google for Jobs / SEO discovery, useless for
// publisher-program attribution. Always hand partners the partner-tagged
// URL.
//
// Spec references (as of Apr 2026):
//   - Indeed v2 XML: https://docs.indeed.com/direct-job-posting/xml-feed
//   - Google for Jobs JobPosting: https://developers.google.com/search/docs/appearance/structured-data/job-posting
//   - ZipRecruiter XML: mirrors Indeed format with <source> root

import { type NextRequest } from 'next/server'
// supabaseFresh has a 30s fetch revalidate vs the 300s default — see
// src/lib/supabase.ts for why feed routes specifically need a short window
// after data-shape migrations (e.g. the 2026-05-20 syndication_targets
// backfill stuck this route at 425 jobs for 6+ hours).
import { supabaseFresh as supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { normalizePartner } from '@/lib/partner-attribution'
// All XML helpers (cdata, indeedJobType, descriptionHtml, rfc822) live in
// feed-builders.ts. /jobs.xml previously had its own local copies that
// silently drifted — e.g. rfc822() was a misnamed clone of rfc822() (there
// is no such thing as ISO 822; the format Indeed/ZipRecruiter expect IS
// RFC 822). Consolidating prevents future drift between the
// per-partner feeds and this multi-publisher feed.
import {
  cdata,
  indeedJobType,
  descriptionHtml,
  rfc822,
  hasUsableDescription,
  isBuildPhase,
} from '@/lib/feed-builders'

// Refresh every 6 hours. This is the heaviest feed (12-batch query +
// ~35MB serialization per regen), and its consumers re-crawl on their own
// far-slower schedules: Indeed ~4h, Google for Jobs ~24h, the rest daily+.
// At the old 900s (96 regens/day) we paid that heavy regen ~96×/day to
// serve crawlers who poll a handful of times/day — pure Vercel-invocation
// waste (2026-05-28 cost pass). 21600s (4 regens/day) keeps the feed well
// within every consumer's freshness tolerance (a job stale by ≤6h is
// invisible — listings are valid for weeks) while cutting regen cost 24×.
//
// IMPORTANT: do NOT add `export const dynamic = 'force-static'` here. The
// previous version had it (May 16 deploy), which contradicted `revalidate`
// and pinned the response to whatever inventory existed at build time.
// Without force-static, Next.js generates this route at ISR cadence,
// honoring the revalidate window. The route reads no per-request inputs
// so it's still cacheable at the CDN edge.
export const revalidate = 21600

export async function GET(req: NextRequest): Promise<Response> {
  // Per-partner attribution: every <url> in the body becomes
  // https://freejobpost.co/jobs/<slug>?ref=<partner>. The /jobs/[slug] page
  // reads ?ref and uses it for the Apply button's /click/[slug]?p=<partner>.
  const partner = normalizePartner(req.nextUrl.searchParams.get('ref'))
  const partnerSuffix = partner === 'internal' ? '' : `?ref=${encodeURIComponent(partner)}`

  // /jobs.xml is the "everything" publisher feed. Submitted to Indeed /
  // ZipRecruiter / Talent.com / Adzuna partner intake. Each partner ingests
  // and respects employer-level rules at the row level (per-network opt-in
  // lives in syndication_targets — surfaced via /feeds/<network>.xml in
  // the future when partners want filtered streams).
  //
  // The PostgREST anon-role default `db_max_rows=1000` silently clamps a
  // single `.limit(N>1000)`. The previous version had `.limit(5000)` and
  // was therefore silently serving 1,000 of ~9,000 active jobs to every
  // crawler — 89% under-coverage. Fix: parallel .range() batches mirroring
  // the /jobs page (commit a7aaf6f) and the freeresumepost homepage. Wall
  // time is unchanged because all batches fire concurrently.
  // 12 × 1000 headroom — /jobs.xml hit the 9-batch ceiling on 2026-05-20
  // once total active inventory crossed 9,000. See same constant in
  // src/lib/feed-builders.ts for the matching rationale.
  const NUM_BATCHES = 12
  const BATCH_SIZE = 1000
  const nowIso = new Date().toISOString()
  const baseQuery = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
  const batches = await Promise.all(
    Array.from({ length: NUM_BATCHES }, (_, i) =>
      baseQuery().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )

  type FeedJob = PublicJob & { updated_at: string; employer_id: string }
  const allJobs = batches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])

  // FAIL CLOSED (2026-05-28): if the DB query failed/timed out, every batch
  // returns { data: null, error } and allJobs is []. Without this guard the
  // route would build a valid-looking but EMPTY <source> feed and ISR would
  // cache it for 900s — shipping "0 open positions" to Indeed / Google for
  // Jobs / Jooble, who then de-list us. We have thousands of active jobs at
  // all times, so 0 fetched ALWAYS means infrastructure failure, never a
  // real empty inventory.
  //
  // Throwing here makes Next.js ISR keep serving the LAST GOOD cached feed
  // (stale-while-revalidate) instead of overwriting it with emptiness; on a
  // cold cache it 500s, which is still correct (a partner retries a 500;
  // a partner trusts a 200-with-0-jobs and drops us). Root cause this date:
  // providers.avahealth.co directory RPCs (directory_providers, ~14-22s each)
  // saturating the shared Postgres → freejobpost feed queries time out.
  // RUNTIME-ONLY fail-closed (see feed-builders.ts isBuildPhase). At build,
  // a throw aborts the deploy with no stale cache to fall back to; at runtime
  // it correctly makes Next serve the last-good cached feed. So only throw
  // when NOT building.
  const anyBatchErrored = batches.some((b) => b.error)
  if (allJobs.length === 0 && !isBuildPhase()) {
    throw new Error(
      `jobs.xml: 0 jobs fetched (anyBatchErrored=${anyBatchErrored}) — ` +
      `refusing to cache an empty feed. Serving last-good ISR cache instead.`,
    )
  }

  // Thin-description filter. Indeed v2 / Google for Jobs / Talent.com /
  // Jooble / ZipRecruiter all penalize feeds with high percentages of
  // empty-body listings — and our /jobs.xml is the ONE feed Indeed,
  // Google, and (as of 5/22) Jooble all read.
  //
  // Pre-2026-05-21 audit: ~24% of corpus has empty/<p></p>-only descriptions
  // from the Workday shallow-refresh import path.
  //
  // 2026-05-22: switched from inline 50-char check to the shared
  // hasUsableDescription() helper. Threshold there was bumped 50 → 250
  // after Jooble (ticket #1774316) reviewed our feed and flagged "not all
  // the vacancies are filled in correctly" — 50 chars passed one-liners,
  // 250 chars is a floor for a description with responsibilities +
  // requirements. The on-site /jobs browse is unaffected (still shows
  // all active jobs); partner XML is the only thing filtered.
  const jobs = allJobs.filter((j) => hasUsableDescription(j.description))

  // Resolve company names per employer in one batched query.
  // Reads from public_employers_directory (anon-safe view) — the underlying
  // public_employers table is internal-only because it carries contact PII.
  const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))]
  type EmpRow = { id: string; company_name: string }
  const employerNameMap = new Map<string, string>()
  if (employerIds.length > 0) {
    const { data: emps } = await supabase
      .from('public_employers_directory')
      .select('id, company_name')
      .in('id', employerIds)
    for (const e of ((emps ?? []) as EmpRow[])) employerNameMap.set(e.id, e.company_name)
  }

  const now = rfc822(new Date())

  const jobsXml = jobs
    .map((job) => {
      const loc = locationLabel(job)
      const sal = formatSalary(job.salary_min, job.salary_max)
      const title = job.title || job.role || 'Healthcare Role'
      const posted = job.created_at ? rfc822(new Date(job.created_at)) : now
      const validThrough = job.expires_at
        ? rfc822(new Date(job.expires_at))
        : rfc822(new Date(Date.now() + 60 * 86400_000))
      const employerName = employerNameMap.get(job.employer_id) || 'Ava Health Partners'
      return `  <job>
    <title>${cdata(title)}</title>
    <date>${cdata(posted)}</date>
    <expirationdate>${cdata(validThrough)}</expirationdate>
    <referencenumber>${cdata(job.slug)}</referencenumber>
    <url>${cdata(`https://freejobpost.co/jobs/${job.slug}${partnerSuffix}`)}</url>
    <company>${cdata(employerName)}</company>
    <sourcename>${cdata('freejobpost.co')}</sourcename>
    <city>${cdata(job.city ?? '')}</city>
    <state>${cdata(job.state ?? '')}</state>
    <country>${cdata('US')}</country>
    <description>${cdata(descriptionHtml(job))}</description>
    <salary>${cdata(sal ?? '')}</salary>
    <jobtype>${cdata(indeedJobType(job.employment_type))}</jobtype>
    <category>${cdata(job.specialty ?? job.role ?? 'Healthcare')}</category>
    <experience>${cdata(job.experience_required ?? '')}</experience>
    <remotetype>${cdata(
      job.remote_hybrid === 'remote'
        ? 'Fully Remote'
        : job.remote_hybrid === 'hybrid'
        ? 'Hybrid Remote'
        : ''
    )}</remotetype>
    <location>${cdata(loc)}</location>
  </job>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>freejobpost.co</publisher>
  <publisherurl>https://freejobpost.co</publisherurl>
  <lastBuildDate>${now}</lastBuildDate>
  <description>Free healthcare job feed — operated by Ava Health Partners LLC. ${jobs.length} open positions.</description>
${jobsXml}
</source>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 6h CDN cache (was 15m). This route is DYNAMIC (supabaseFresh = no-store),
      // so `export const revalidate` is moot — THIS header is the real cache
      // lever. Partners re-crawl every 4-24h; swr=24h serves stale instantly
      // during regen. 2026-05-28 cost pass (24x fewer origin renders).
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
