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
import { supabaseFresh as supabase, hourIso } from '@/lib/supabase'
import { activeJobBatchCount, runBatchesConcurrencyCapped } from '@/lib/active-batch-count'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'
import { normalizePartner } from '@/lib/partner-attribution'
// All XML helpers (cdata, indeedJobType, descriptionHtml, rfc822,
// iso8601DateTime, iso8601Date) live in feed-builders.ts. /jobs.xml
// previously had its own local copies that silently drifted. rfc822() is
// only correct for <lastBuildDate> now — Indeed's own spec wants <date>/
// <expirationdate> in ISO-8601, not RFC-822 (see feed-builders.ts's note by
// iso8601DateTime, 2026-08-20). Consolidating prevents future drift between
// the per-partner feeds and this multi-publisher feed.
import {
  cdata,
  indeedJobType,
  descriptionHtml,
  rfc822,
  iso8601DateTime,
  iso8601Date,
  hasUsableDescription,
  isBuildPhase,
  MIN_DESCRIPTION_CHARS,
} from '@/lib/feed-builders'

// HARD BYTE BUDGET (2026-08-20): every other Indeed-format feed gets this cap
// via buildIndeedFormatFeed()'s MAX_FEED_BYTES (feed-builders.ts) — jobs.xml
// reimplements the job loop inline instead of calling that shared builder (it
// needs a dynamic per-request ?ref=<partner> URL suffix that the shared
// builder's per-target jobUrlWithUtm() doesn't support) and so never got the
// cap. This is the one heavy feed still on ISR (see `revalidate` below, NOT
// force-dynamic), so an oversized render fails the production build outright
// at Vercel's 19.07MB FALLBACK_BODY_TOO_LARGE limit — the same incident class
// MAX_FEED_BYTES exists to prevent. Same 16MB figure as the shared builder:
// 3MB headroom under the limit for the XML wrapper + future per-row growth.
// Jobs are ordered updated_at DESC, so we keep the freshest and drop the tail.
const MAX_FEED_BYTES = 16_000_000

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
  // 2026-05-28 audit: 12→30. At 14.6K active inventory the 12K ceiling silently
  // dropped ~2.6K oldest jobs from this feed.
  // 2026-08-19: the batch count is now derived from a real COUNT of the active
  // corpus (see active-batch-count.ts) instead of a hand-bumped constant, so
  // this feed tracks inventory growth on its own.
  const numBatches = await activeJobBatchCount(supabase)
  const BATCH_SIZE = 1000
  const nowIso = hourIso()
  const baseQuery = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    // DB-side mirror of hasUsableDescription() (2026-06 audit): the route
    // discarded thin rows in JS after fetching them — ~46% wasted fetch.
    // Pinned to MIN_DESCRIPTION_CHARS so the DB prefilter and the JS filter
    // below agree. jobs.xml is the partner megafeed (Jooble, Indeed, Talent,
    // etc.), so it uses the 600-char rich-content bar, not the 250 page floor.
    .gte('description_usable_chars', MIN_DESCRIPTION_CHARS)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  // 2026-08-19 — was a raw Promise.all over ALL numBatches, i.e. up to 60 (now
  // more, since the count is inventory-derived) simultaneous 1,000-row range
  // queries against the shared Nano Postgres on every uncached crawler hit.
  // This was the last caller still firing the uncapped burst; linkedin.xml,
  // sitemap.ts and feed-builders.ts were all routed through the shared capped
  // runner on 2026-08-12 and this one was missed. Same total queries, same
  // output, just BATCH_CONCURRENCY (8) in flight at a time instead of all of
  // them — which also keeps the route under Workers' subrequest ceiling as the
  // batch count scales with real inventory.
  const batches = await runBatchesConcurrencyCapped(numBatches, (i) =>
    baseQuery().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
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
  const jobs = allJobs.filter((j) => hasUsableDescription(j.description, MIN_DESCRIPTION_CHARS))

  // Resolve company names per employer in one batched query.
  // Reads public_employers_directory (anon-safe view) — the underlying
  // public_employers table is internal-only because it carries contact PII.
  //
  // 2026-08-20: this pointed at public_employers_directory_all, which does not
  // exist in the database. The error was swallowed, the map came back empty,
  // and every job without its own company_name fell through to the
  // "Ava Health Partners" default below — roughly half the live feed going out
  // to Indeed / Google for Jobs / ZipRecruiter under the wrong company. Every
  // employer those jobs point at is status='active' and
  // verified_healthcare_org=true, so the existing directory view covers them.
  const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))]
  type EmpRow = { id: string; company_name: string }
  const employerNameMap = new Map<string, string>()
  if (employerIds.length > 0) {
    const { data: emps, error: empErr } = await supabase
      .from('public_employers_directory')
      .select('id, company_name')
      .in('id', employerIds)
    if (empErr) console.error('employer name lookup failed:', empErr.message)
    for (const e of ((emps ?? []) as EmpRow[])) employerNameMap.set(e.id, e.company_name)
  }

  const now = rfc822(new Date())

  // Cap-and-break loop (see MAX_FEED_BYTES note above), mirroring
  // buildIndeedFormatFeed's byte-budget logic. jobs is already ordered
  // updated_at DESC, id DESC, so a break here always sheds the oldest tail.
  const rows: string[] = []
  let feedBytes = 0
  let included = 0
  for (const job of jobs) {
    const loc = locationLabel(job)
    const sal = formatSalary(job.salary_min, job.salary_max)
    const title = job.title || job.role || 'Healthcare Role'
    const posted = job.created_at ? iso8601DateTime(new Date(job.created_at)) : iso8601DateTime(new Date())
    const validThrough = job.expires_at
      ? iso8601Date(new Date(job.expires_at))
      : iso8601Date(new Date(Date.now() + 60 * 86400_000))
    const employerName = job.company_name || employerNameMap.get(job.employer_id) || 'Ava Health Partners'
    const row = `  <job>
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
    feedBytes += Buffer.byteLength(row, 'utf8')
    if (feedBytes > MAX_FEED_BYTES) {
      console.warn(
        `jobs.xml: byte budget hit — serialized ${included}/${jobs.length} jobs (~${Math.round(feedBytes / 1_000_000)}MB)`,
      )
      break
    }
    rows.push(row)
    included++
  }
  const jobsXml = rows.join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>freejobpost.co</publisher>
  <publisherurl>https://freejobpost.co</publisherurl>
  <lastBuildDate>${now}</lastBuildDate>
  <description>Free healthcare job feed. Operated by Ava Health Partners LLC. ${included} open positions.</description>
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
