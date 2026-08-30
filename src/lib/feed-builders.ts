// Shared XML feed builder for Indeed-spec aggregators (Indeed, ZipRecruiter,
// Glassdoor, Adzuna, Jooble, Talent.com). They all eat a near-identical XML
// document, so we abstract the inner per-job element here and let each
// network's route just declare its filter target + minor format tweaks.
//
// LinkedIn is the outlier (different field names, ISO-8601 dates, snake-case
// jobtype) — see /feeds/linkedin.xml.

import type { PublicJob } from './public-jobs'
import {
  JOB_DETAIL_FIELDS,
  PUBLIC_EMPLOYER_JOB_SOURCE,
  PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN,
  formatSalary,
  locationLabel,
} from './public-jobs'
// Use the short-revalidate supabase client — see src/lib/supabase.ts for
// why feed routes need a 30s fetch window vs the page-default 300s.
import { supabaseFresh as supabase, hourIso } from './supabase'
import type { SyndicationTargetId } from './syndication-targets'
import { activeJobBatchCount, runBatchesConcurrencyCapped } from './active-batch-count'

export type FeedJob = PublicJob & {
  updated_at: string
  employer_id: string
  syndication_targets: SyndicationTargetId[]
}

// True during `next build` (Next sets NEXT_PHASE=phase-production-build).
// Used to make feed routes' fail-closed throw RUNTIME-ONLY: at build time a
// throw aborts the whole deploy (and there's no stale cache to fall back to
// anyway), so we let the build emit a possibly-empty feed that the first
// runtime ISR revalidation replaces. At runtime the throw correctly serves
// the last-good cached feed. Exported so the standalone feed route handlers
// (jobs.xml, rss.xml) share the exact same guard.
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

export function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
}

// XML text-node escaping for the RSS-spec feeds (rss.xml, /feeds/state,
// /feeds/specialty). Indeed-format feeds use cdata() instead. Centralized here
// so those routes don't each carry a byte-identical copy (2026-05-29 DRY pass).
export function escapeXml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Per-network attribution. Aggregators rewrite the URL when they crawl,
// but enough networks pass through query params that this still gives us
// trackable referrer signal in Vercel Analytics + downstream tooling.
// Canonical on /jobs/[slug] strips UTMs, so SEO isn't fragmented.
//
// `?ref=<partner>` is what /jobs/[slug]/page.tsx reads to pass through to
// the /click/[slug]?p=<partner> redirect — this is the link that powers
// apply_clicks attribution. The utm_* params are kept for Vercel Analytics
// + any external downstream tooling that's already wired to UTMs. Both
// living on the same URL is intentional belt-and-suspenders.
export function jobUrlWithUtm(slug: string, target: SyndicationTargetId | 'rss'): string {
  return `https://freejobpost.co/jobs/${slug}?ref=${target}&utm_source=${target}&utm_medium=feed&utm_campaign=syndication`
}

export function rfc822(d: Date): string {
  return d.toUTCString()
}

// Indeed's XML feed spec (docs.indeed.com/dev/reference/xml-feed, checked
// 2026-08-20) requires <date> in ISO-8601 WITH time (worked example:
// 2021-06-29T22:49:39Z) and <expirationdate> as a plain YYYY-MM-DD date
// (worked example: 2021-11-08) — NOT the RFC-822 string rfc822() produces.
// indeedFormatJobElement/buildOriginatedFeed use these two for those fields;
// rfc822() itself is still correct for <lastBuildDate> on the wrapping
// <source> envelope, which isn't part of Indeed's per-job field spec and
// stays RFC-822 by RSS-adjacent convention. iso8601Date mirrors linkedin.xml's
// own date-only helper (LinkedIn only ever wanted the date, never the time).
export function iso8601DateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function iso8601Date(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function indeedJobType(t: PublicJob['employment_type']): string {
  switch (t) {
    case 'full_time': return 'fulltime'
    case 'part_time': return 'parttime'
    case 'contract': return 'contract'
    case 'locum': return 'temporary'
    case 'per_diem': return 'temporary'
    case 'internship': return 'internship'
    default: return 'fulltime'
  }
}

// Per-job description length cap for syndication feeds.
//
// 2026-06: every Indeed-format feed (jobs.xml + adzuna/talent/glassdoor/
// careerjet/jooble/indeed/ziprecruiter/originated) serialized the FULL job
// description via descriptionHtml(). With ~8,085 feed-eligible jobs averaging
// ~3.3K chars (heavy tail), the rendered feeds reached ~35MB at full length —
// past Vercel's 19.07MB ISR static-fallback limit, which FAILS the production
// build at "Deploying outputs" (FALLBACK_BODY_TOO_LARGE). Truncating each
// description (word-boundary cut, still well above the 250-char
// hasUsableDescription floor publishers expect) bounds the feed; every <job>
// still carries the <url> to the complete posting, so the full description is
// one click away. (rss.xml already slices to 600, so this single change covers
// all the oversized feeds.)
//
// SIZE NOTE (measured 2026-06-02): at a 1,500-char cap the LIVE adzuna.xml was
// 17.64MB — only ~8% under the 19.07MB limit, crossing it at just ~8,740
// feed-eligible jobs (NOT ~11K as previously assumed; non-description per-job
// XML overhead is ~950B and dominates). Lowered to 1,000 chars (~15MB, ~22%
// headroom, crosses ~10.7K jobs) for a safe margin as inventory grows. The
// DURABLE fix when inventory nears ~10K is per-feed pagination / a job-COUNT
// cap (bounds size regardless of corpus growth) rather than shortening
// descriptions further. The restored build-time FALLBACK_BODY_TOO_LARGE check
// (the VERCEL_BYPASS_FALLBACK_OVERSIZED_ERROR band-aid was removed) will fail
// the build LOUDLY if a feed crosses again — it won't silently ship broken.
export const FEED_DESCRIPTION_MAX_CHARS = 1000

function truncateForFeed(text: string): string {
  if (text.length <= FEED_DESCRIPTION_MAX_CHARS) return text
  const cut = text.slice(0, FEED_DESCRIPTION_MAX_CHARS)
  // Back up to the last whitespace so a word isn't sliced mid-token — unless
  // that boundary is implausibly far back, in which case hard-cut.
  const lastSpace = cut.lastIndexOf(' ')
  const body = lastSpace > FEED_DESCRIPTION_MAX_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut
  return body.trimEnd() + '…'
}

export function descriptionHtml(job: PublicJob): string {
  const src = truncateForFeed(job.description ?? '')
  const blocks = src.split(/\n\n+/).map((b) => {
    const html = b
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
    return `<p>${html}</p>`
  })
  return blocks.join('')
}

// freeJobPostCategoryHashtag maps a job to FreeJobPost's Indeed category code,
// appended to ORIGINATED job descriptions in the partner feed. The code
// rides into Indeed (which indexes the description text), so you can search/filter
// Indeed by category and group sponsored campaigns by bucket. Buckets: 101 Nurses ·
// 102 Advanced Practice · 103 Dental/Specialty · 104 Allied Health. Physician/PA roles
// are excluded at intake (see submit_public_job_rpc), so this only ever classifies
// nurse and allied-health postings. Returns null when a role doesn't classify (we
// don't mislabel). Keyword lists are intentionally simple — tune them with the
// recruiting team.
export function freeJobPostCategoryHashtag(job: PublicJob): string | null {
  const hay = `${job.role ?? ''} ${job.specialty ?? ''} ${job.title ?? ''}`.toLowerCase()
  const has = (re: RegExp) => re.test(hay)
  // Advanced-practice nurses first (their titles contain "nurse" substrings).
  if (has(/nurse practitioner|\bnp\b|\baprn\b/)) return '#FJP102'
  if (has(/\bnurse\b|registered nurse|\brn\b|\blpn\b|\blvn\b|\bcna\b|crna/)) return '#FJP101'
  if (has(/therap(ist|y)|pharmac(ist|y)|technolog(ist|y)|technician|sonograph|radiograph|imaging|x-ray|laborator|phlebotom|respiratory|dietit|nutrition|medical assistant|paramedic|\bemt\b|surgical tech/)) return '#FJP104'
  if (has(/dentist|dental|orthodont|endodont|periodont/)) return '#FJP103'
  return null
}

// Fetch active direct-employer jobs assigned to a network. PostgREST caps each
// range at 1,000 rows, so the shared count helper controls pagination.
const BATCH_SIZE = 1000

// Strict partners require an explicit target. For older direct posts, an empty
// array remains the legacy default for volume feeds only.
const STRICT_PARTNERS: ReadonlySet<SyndicationTargetId> = new Set([
  'indeed',
  'linkedin',
  'ziprecruiter',
])

async function fetchJobsForTarget(target: SyndicationTargetId): Promise<FeedJob[]> {
  const nowIso = hourIso()
  // PostgREST `.or()` joins clauses with OR; `cs.{target}` is the array
  // `@>` operator, `eq.{}` matches an empty array literal.
  const isStrict = STRICT_PARTNERS.has(target)
  const filterClause = isStrict
    ? `syndication_targets.cs.{${target}}`
    : `syndication_targets.cs.{${target}},syndication_targets.eq.{}`
  const baseFiltered = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, syndication_targets')
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    // DB-side mirror of hasUsableDescription() (generated column, 2026-06
    // audit): the JS post-filter below discarded ~46% of fetched rows.
    // Filtering here cuts the batch fetch volume nearly in half with
    // byte-identical feed output. Reads MIN_DESCRIPTION_CHARS so the DB
    // floor and the JS floor never drift apart.
    .gte('description_usable_chars', MIN_DESCRIPTION_CHARS)
    .or(filterClause)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })

  const numBatches = await activeJobBatchCount(supabase)

  const filteredBatches = await runBatchesConcurrencyCapped(numBatches, (i) =>
    baseFiltered().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
  )
  if (filteredBatches.some((batch) => batch.error) && !isBuildPhase()) {
    throw new Error(`feed[${target}]: direct-employer query failed, refusing to cache a partial feed.`)
  }
  return filteredBatches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])
}

// Resolve company names for a batch of employer ids in one query.
//
// 2026-08-20: this read public_employers_directory_all, which does not exist in
// the database. The error was swallowed, the map came back empty, and every job
// without its own company_name fell through to a site-level default, sending
// live jobs to Indeed / LinkedIn / Google under the
// wrong company. All 23 employers those jobs point at are status='active' and
// verified_healthcare_org=true, so public_employers_directory covers them.
async function resolveEmployerNames(jobs: FeedJob[]): Promise<Map<string, string>> {
  const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))]
  const map = new Map<string, string>()
  if (employerIds.length === 0) return map
  type EmpRow = { id: string; company_name: string }
  const { data: emps, error: empErr } = await supabase
    .from('public_employers_directory')
    .select('id, company_name')
    .in('id', employerIds)
  if (empErr) console.error('employer name lookup failed:', empErr.message)
  for (const e of ((emps ?? []) as EmpRow[])) map.set(e.id, e.company_name)
  return map
}

// Inner <job> element shared by Indeed / ZipRecruiter / Glassdoor / Adzuna /
// Jooble / Talent.com. Same spec, single implementation.
function indeedFormatJobElement(
  job: FeedJob,
  employerName: string,
  sourceName: string,
  target: SyndicationTargetId,
): string {
  const loc = locationLabel(job)
  const sal = formatSalary(job.salary_min, job.salary_max)
  const title = job.title || job.role || 'Healthcare Role'
  const posted = job.created_at ? iso8601DateTime(new Date(job.created_at)) : iso8601DateTime(new Date())
  const validThrough = job.expires_at
    ? iso8601Date(new Date(job.expires_at))
    : iso8601Date(new Date(Date.now() + 60 * 86400_000))
  return `  <job>
    <title>${cdata(title)}</title>
    <date>${cdata(posted)}</date>
    <expirationdate>${cdata(validThrough)}</expirationdate>
    <referencenumber>${cdata(job.slug)}</referencenumber>
    <url>${cdata(jobUrlWithUtm(job.slug, target))}</url>
    <company>${cdata(employerName)}</company>
    <sourcename>${cdata(sourceName)}</sourcename>
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
}

// Wraps the inner job elements in the standard <source> envelope.
function wrapIndeedFormat(jobsXml: string, jobCount: number, networkLabel: string): string {
  const now = rfc822(new Date())
  return `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>freejobpost.co</publisher>
  <publisherurl>https://freejobpost.co</publisherurl>
  <lastBuildDate>${now}</lastBuildDate>
  <description>FreeJobPost direct nursing and allied-health employer feed (${networkLabel}). ${jobCount} open positions.</description>
${jobsXml}
</source>`
}

// Minimum non-whitespace description length published to partner feeds. Thin
// posts remain browseable onsite but stay out of quality-sensitive feeds.
export const MIN_DESCRIPTION_CHARS = 600

// The originated feed is a lower-threshold direct-employer feed for partners
// that accept shorter descriptions.
export const MIN_ORIGINATED_DESCRIPTION_CHARS = 250

// Floor for whether a /jobs/[slug] PAGE is indexable: drives the noindex robots
// meta + whether the page emits JobPosting JSON-LD, and mirrored by sitemap.ts
// so the sitemap never submits a noindex URL. This is the INDEXABILITY bar, a
// different question from the partner-feed QUALITY bar (MIN_DESCRIPTION_CHARS).
// Kept at 250: a 250-599 char job page is a legit indexable page with a real
// (if short) description that Google for Jobs accepts — it just isn't rich
// enough to ship to aggregators like Jooble. These were ONE constant until
// 2026-06-15, when raising the feed bar to 600 silently noindexed ~10.9K pages
// in the 250-599 band (page gates read hasUsableDescription's default arg).
// Split out so the page/sitemap floor and the feed floor can never drift again.
export const MIN_INDEXABLE_DESCRIPTION_CHARS = 250

export function hasUsableDescription(
  description: string | null | undefined,
  minChars: number = MIN_DESCRIPTION_CHARS,
): boolean {
  if (!description) return false
  // Strip HTML tags + collapse whitespace before measuring — empty
  // <p></p> wrappers from html-to-text imports otherwise pass a naive
  // length check.
  const stripped = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length >= minChars
}

// One-call helper used by every Indeed-format feed route. Pass the target
// (e.g. 'indeed', 'adzuna') and a label for the description.
export async function buildIndeedFormatFeed(
  target: SyndicationTargetId,
  networkLabel: string,
): Promise<Response> {
  const allJobs = await fetchJobsForTarget(target)
  // Empty is valid while direct-employer inventory is growing. Query errors
  // are handled inside fetchJobsForTarget so failed reads still fail closed.
  const jobs = allJobs.filter((j) => hasUsableDescription(j.description))
  const employerNames = await resolveEmployerNames(jobs)
  // HARD BYTE BUDGET (2026-06-10): /feeds/adzuna.xml's prerendered ISR
  // fallback hit 23.19MB and FAILED the deploy at Vercel's 19.07MB
  // FALLBACK_BODY_TOO_LARGE guardrail — the exact re-arming the 1500-char
  // description cap's SIZE NOTE predicted once inventory grew. Caps below
  // re-arm with growth; a byte budget cannot. Jobs are ordered
  // updated_at DESC, so we keep the freshest and drop the tail once the
  // serialized feed reaches ~16MB (3MB headroom under the limit for the
  // XML wrapper + future per-row growth). Partners re-crawl every 4-24h,
  // so the tail (oldest inventory) is the right thing to shed.
  const MAX_FEED_BYTES = 16_000_000
  const rows: string[] = []
  let feedBytes = 0
  let included = 0
  for (const job of jobs) {
    // Prefer the company name stored on the direct post, then its employer row.
    const name = job.company_name || employerNames.get(job.employer_id) || 'Employer'
    const row = indeedFormatJobElement(job, name, 'freejobpost.co', target)
    feedBytes += Buffer.byteLength(row, 'utf8')
    if (feedBytes > MAX_FEED_BYTES) {
      console.warn(
        `feed[${target}]: byte budget hit — serialized ${included}/${jobs.length} jobs (~${Math.round(feedBytes / 1_000_000)}MB)`,
      )
      break
    }
    rows.push(row)
    included++
  }
  const jobsXml = rows.join('\n')
  const xml = wrapIndeedFormat(jobsXml, included, networkLabel)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 6h CDN cache (was 15m). These builders power the dynamic (no-store)
      // per-partner feed routes, so the route's export const revalidate is
      // moot — THIS header governs origin-render frequency. Partners re-crawl
      // every 4-24h; swr=24h serves stale instantly. 2026-05-28 cost pass.
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}

// Fetch active jobs that ORIGINATE on freejobpost — i.e. employer-posted
// via /post-job. The exact source filter excludes every imported or seeded row.
//
async function fetchOriginatedJobs(): Promise<FeedJob[]> {
  const nowIso = hourIso()
  const baseQ = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at')
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .gte('description_usable_chars', MIN_ORIGINATED_DESCRIPTION_CHARS) // mirrors hasUsableDescription (originated floor)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  const numBatches = await activeJobBatchCount(supabase)
  const batches = await runBatchesConcurrencyCapped(numBatches, (i) =>
    baseQ().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
  )
  if (batches.some((batch) => batch.error) && !isBuildPhase()) {
    throw new Error('feed[originated]: direct-employer query failed, refusing to cache a partial feed.')
  }
  return batches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])
}

// Lower-threshold Indeed-format feed for direct employer posts.
//
// Doesn't use a SyndicationTargetId (those represent per-board assignment
// gates; "originated" is a content-source dimension, not a publisher
// target). The <url> field falls back to a clean canonical URL — strict
// partners typically rewrite or append their own attribution params on
// crawl anyway.
export async function buildOriginatedFeed(networkLabel: string): Promise<Response> {
  const allJobs = await fetchOriginatedJobs()
  // NOTE: no fail-closed 0-guard here. Unlike the volume/strict feeds,
  // "originated" (employer-posted, is_ats_import=false) inventory is
  // legitimately small (~422 today) and CAN genuinely reach 0 if all
  // employer posts expire — that's a real state, not necessarily DB
  // failure, so throwing would risk masking the real empty case. The
  // strict partners that consume this feed tolerate an occasional empty
  // originated feed. (If this grows into a core partner surface, revisit.)
  // Thin-description filter at the originated floor (250), NOT the 600
  // volume-feed bar — these are direct-employer roles, mostly a solid
  // paragraph (250-600 chars); 600 would gut the feed. See
  // MIN_ORIGINATED_DESCRIPTION_CHARS for why.
  const jobs = allJobs.filter((j) =>
    hasUsableDescription(j.description, MIN_ORIGINATED_DESCRIPTION_CHARS),
  )
  const employerNames = await resolveEmployerNames(jobs)
  const jobsXml = jobs
    .map((job) => {
      const name = job.company_name || employerNames.get(job.employer_id) || 'Employer'
      // Inline the indeedFormatJobElement body to bypass the
      // jobUrlWithUtm SyndicationTargetId constraint. URL is the bare
      // canonical /jobs/[slug] — no ?ref, no utm_* — since strict
      // partners append their own attribution.
      const catTag = freeJobPostCategoryHashtag(job)
      const loc = locationLabel(job)
      const sal = formatSalary(job.salary_min, job.salary_max)
      const title = job.title || job.role || 'Healthcare Role'
      const posted = job.created_at ? iso8601DateTime(new Date(job.created_at)) : iso8601DateTime(new Date())
      const validThrough = job.expires_at
        ? iso8601Date(new Date(job.expires_at))
        : iso8601Date(new Date(Date.now() + 60 * 86400_000))
      return `  <job>
    <title>${cdata(title)}</title>
    <date>${cdata(posted)}</date>
    <expirationdate>${cdata(validThrough)}</expirationdate>
    <referencenumber>${cdata(job.slug)}</referencenumber>
    <url>${cdata(`https://freejobpost.co/jobs/${job.slug}`)}</url>
    <company>${cdata(name)}</company>
    <sourcename>${cdata('freejobpost.co')}</sourcename>
    <city>${cdata(job.city ?? '')}</city>
    <state>${cdata(job.state ?? '')}</state>
    <country>${cdata('US')}</country>
    <description>${cdata(descriptionHtml(job) + (catTag ? `<p>${catTag}</p>` : ''))}</description>
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
  const xml = wrapIndeedFormat(jobsXml, jobs.length, networkLabel)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // 6h CDN cache (was 15m). These builders power the dynamic (no-store)
      // per-partner feed routes, so the route's export const revalidate is
      // moot — THIS header governs origin-render frequency. Partners re-crawl
      // every 4-24h; swr=24h serves stale instantly. 2026-05-28 cost pass.
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
