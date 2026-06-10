// Shared XML feed builder for Indeed-spec aggregators (Indeed, ZipRecruiter,
// Glassdoor, Adzuna, Jooble, Talent.com). They all eat a near-identical XML
// document, so we abstract the inner per-job element here and let each
// network's route just declare its filter target + minor format tweaks.
//
// LinkedIn is the outlier (different field names, ISO-8601 dates, snake-case
// jobtype) — see /feeds/linkedin.xml.

import type { PublicJob } from './public-jobs'
import { JOB_DETAIL_FIELDS, formatSalary, locationLabel } from './public-jobs'
// Use the short-revalidate supabase client — see src/lib/supabase.ts for
// why feed routes need a 30s fetch window vs the page-default 300s.
import { supabaseFresh as supabase, hourIso } from './supabase'
import type { SyndicationTargetId } from './syndication-targets'
import { activeJobBatchCount } from './active-batch-count'

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

// avaCategoryHashtag — maps a job to Ava Health's Indeed category code, appended to
// ORIGINATED job descriptions in the partner feed (see buildOriginatedFeed). Mirrors how
// MASC Medical stamps #MASC1xx at the bottom of each posting: the code rides into Indeed
// (which indexes the description text), so you can search/filter Indeed by category and
// group sponsored campaigns by bucket. Buckets: 101 Nurses · 102 Primary Care / Advanced
// Practice · 103 Specialties · 104 Allied Health. Returns null when a role doesn't classify
// (we don't mislabel). Keyword lists are intentionally simple — tune them with the recruiting team.
export function avaCategoryHashtag(job: PublicJob): string | null {
  const hay = `${job.role ?? ''} ${job.specialty ?? ''} ${job.title ?? ''}`.toLowerCase()
  const has = (re: RegExp) => re.test(hay)
  // Advanced-practice providers first (their titles contain "nurse"/"physician" substrings).
  if (has(/nurse practitioner|\bnp\b|physician assistant|\bpa-c\b|\baprn\b/)) return '#AVA102'
  if (has(/\bnurse\b|registered nurse|\brn\b|\blpn\b|\blvn\b|\bcna\b|crna/)) return '#AVA101'
  if (has(/therap(ist|y)|pharmac(ist|y)|technolog(ist|y)|technician|sonograph|radiograph|imaging|x-ray|laborator|phlebotom|respiratory|dietit|nutrition|medical assistant|paramedic|\bemt\b|surgical tech/)) return '#AVA104'
  if (has(/primary care|family (medicine|practice)|internal medicine|general practi|\bpcp\b|hospitalist|pediatrician/)) return '#AVA102'
  if (has(/physician|surgeon|cardiolog|oncolog|neurolog|radiolog|anesthesiolog|psychiatr|dermatolog|orthopedic|gastroenterolog|\w+ologist|physiatr|dentist|dental|orthodont|endodont|periodont|\bpain\b|ob\/?gyn|obstetric|gynecolog|specialist/)) return '#AVA103'
  return null
}

// Fetch active jobs that opt-in to a particular network.
//
// Defensive: if the syndication_targets column doesn't exist yet (migration
// not applied), fall back to returning every active job. This keeps every
// feed route serving content even if Algy hasn't pasted the SQL yet — the
// recruiter-opt-in story kicks in only after the column is live.
//
// NUM_BATCHES parallel .range() batches — PostgREST's anon-role default
// db_max_rows=1000 silently clamps a single `.limit(N>1000)`. Pre-2026-05-19
// this used `.limit(5000)` which was silently returning 1,000 of ~9,000
// active jobs → 88% under-coverage on EVERY per-partner feed.
//
// Bumped from 9 to 12 on 2026-05-20 after the syndication_targets backfill
// opted 8,536 ATS-imported jobs into the volume partners. /jobs.xml hit
// the 9-batch ceiling exactly (9,000 returned vs 8,961 expected — last
// batch was a full 1k) which means total inventory had already crossed
// 9,000 and we were under-serving the tail. 12 batches gives 12,000-row
// headroom for the next federal-pipeline + ATS-onboarding additions.
// 2026-05-28 audit: 12→30. At 14.6K active inventory the 12K ceiling silently
// dropped ~2.6K oldest jobs from every Indeed-format partner feed. Bump (or
// switch to count-based paging — count active, fetch ceil(count/1000)) before 30K.
const BATCH_SIZE = 1000

// Strict partners require an EXPLICIT opt-in in syndication_targets — no
// auto-inclusion of empty-array rows. These are partners with strict quality
// controls or paid-only ingestion where republishing ATS-aggregated jobs is
// either disallowed (Indeed/LinkedIn) or risks feed-quality scoring
// penalties (ZipRecruiter). Volume partners (glassdoor / talent / adzuna /
// jooble / careerjet / rss / google) auto-include empty-array rows, which
// is the "no preference set" default for ATS-imported jobs.
const STRICT_PARTNERS: ReadonlySet<SyndicationTargetId> = new Set([
  'indeed',
  'linkedin',
  'ziprecruiter',
])

async function fetchJobsForTarget(target: SyndicationTargetId): Promise<FeedJob[]> {
  const nowIso = hourIso()
  // Volume partners: match jobs where syndication_targets either contains the
  // partner OR is empty (empty array semantically means "no preference set" —
  // usually ATS-imported rows that ats_import_upsert_jobs inserts with
  // `ARRAY[]::text[]`. Pre-2026-05-20 audit found 655 such jobs being
  // silently excluded from every per-partner feed). Explicit opt-out
  // requires a non-empty array that lacks the partner key.
  //
  // Strict partners: require explicit opt-in. Empty arrays excluded so we
  // never republish ATS-aggregated rows to Indeed/LinkedIn/ZipRecruiter
  // without a recruiter's deliberate choice.
  //
  // PostgREST `.or()` joins clauses with OR; `cs.{target}` is the array
  // `@>` operator, `eq.{}` matches an empty array literal.
  const isStrict = STRICT_PARTNERS.has(target)
  const filterClause = isStrict
    ? `syndication_targets.cs.{${target}}`
    : `syndication_targets.cs.{${target}},syndication_targets.eq.{}`
  const baseFiltered = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id, syndication_targets')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    // DB-side mirror of hasUsableDescription() (generated column, 2026-06
    // audit): the JS post-filter below discarded ~46% of fetched rows.
    // Filtering here cuts the batch fetch volume nearly in half with
    // byte-identical feed output.
    .gte('description_usable_chars', 250)
    .or(filterClause)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })

  const numBatches = await activeJobBatchCount(supabase)

  const filteredBatches = await Promise.all(
    Array.from({ length: numBatches }, (_, i) =>
      baseFiltered().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )
  // If the first batch errored (column doesn't exist), fall back to
  // unfiltered. Otherwise concat everything.
  if (!filteredBatches[0]?.error) {
    return filteredBatches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])
  }

  // Fallback: no syndication_targets column → unfiltered feed.
  const baseFallback = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  const fallbackBatches = await Promise.all(
    Array.from({ length: numBatches }, (_, i) =>
      baseFallback().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )
  return fallbackBatches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])
}

// Resolve company names for a batch of employer ids in one query.
async function resolveEmployerNames(jobs: FeedJob[]): Promise<Map<string, string>> {
  const employerIds = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))]
  const map = new Map<string, string>()
  if (employerIds.length === 0) return map
  type EmpRow = { id: string; company_name: string }
  const { data: emps } = await supabase
    .from('public_employers_directory')
    .select('id, company_name')
    .in('id', employerIds)
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
  const posted = job.created_at ? rfc822(new Date(job.created_at)) : rfc822(new Date())
  const validThrough = job.expires_at
    ? rfc822(new Date(job.expires_at))
    : rfc822(new Date(Date.now() + 60 * 86400_000))
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
  <description>Free healthcare job feed (${networkLabel}) — operated by Ava Health Partners LLC. ${jobCount} open positions.</description>
${jobsXml}
</source>`
}

// Minimum non-whitespace description length we'll publish to partner feeds.
// Partners (Talent.com, Adzuna, Jooble, etc.) penalize feeds with high
// percentages of thin-content listings — Talent.com explicitly down-ranks
// "less than one paragraph" entries during their crawl scoring. Filtering
// these out at the feed level (rather than emitting and getting penalized
// across the whole feed) is the safer move.
//
// Pre-2026-05-21 audit: 2,300 / 9,664 jobs in talent.xml (24%) had
// empty/<p></p>-only descriptions because the Workday ATS importer
// doesn't fetch detail-endpoint descriptions on shallow refresh
// (enrichAll defaults to false — see src/lib/ats-import/workday.ts:215).
// Long-term fix is to default-enrich descriptions in the importer +
// backfill existing rows. Until then we keep these jobs on /jobs (users
// can still browse) but exclude them from partner feeds.
//
// 2026-05-22: threshold raised 50 → 250 after Jooble (ticket #1774316)
// reviewed the feed and flagged jobs without "a clear list of
// responsibilities and requirements." 50 chars passed one-line "stub"
// descriptions; 250 chars is a reasonable floor for a description that
// includes at least a short responsibilities + requirements section.
// Tradeoff: this drops more jobs from partner feeds (the on-site /jobs
// browse still shows them — only partner XML is filtered) but matches
// what publishers expect to ingest.
export const MIN_DESCRIPTION_CHARS = 250

export function hasUsableDescription(description: string | null | undefined): boolean {
  if (!description) return false
  // Strip HTML tags + collapse whitespace before measuring — empty
  // <p></p> wrappers from html-to-text imports otherwise pass a naive
  // length check.
  const stripped = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length >= MIN_DESCRIPTION_CHARS
}

// One-call helper used by every Indeed-format feed route. Pass the target
// (e.g. 'indeed', 'adzuna') and a label for the description.
export async function buildIndeedFormatFeed(
  target: SyndicationTargetId,
  networkLabel: string,
): Promise<Response> {
  const allJobs = await fetchJobsForTarget(target)
  // FAIL CLOSED — but RUNTIME ONLY. 0 fetched means DB failure (we always
  // have thousands of active jobs). At RUNTIME (ISR revalidation) we throw so
  // Next serves the last-good cached feed instead of caching emptiness. But
  // these route handlers ALSO pre-render at BUILD time, and a throw there
  // aborts the whole deploy (observed 2026-05-28: a transient build-time DB
  // timeout on /feeds/talent.xml killed the build). At build there's no stale
  // cache to fall back to, so throwing is pointless + harmful — let it emit a
  // (possibly empty) feed that the first runtime revalidation replaces within
  // `revalidate` seconds against a healthy DB.
  if (allJobs.length === 0 && !isBuildPhase()) {
    throw new Error(`feed[${target}]: 0 jobs fetched — refusing to cache empty feed (likely DB saturation).`)
  }
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
    // Prefer the real per-job company (Adzuna's company.display_name) over the
    // joined meta-employer ("Adzuna (aggregator)") — partners ingest <company>.
    const name = job.company_name || employerNames.get(job.employer_id) || 'Ava Health Partners'
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
// via /post-job + Ava Health seeded roles. Excludes ATS-imported jobs
// (Workday / Greenhouse / Lever / Ashby / USAJobs) that strict publishers
// like Indeed and LinkedIn classify as "republished" content.
//
// Same 9-batch range pattern as fetchJobsForTarget; current inventory is
// ~422 originated jobs but the pattern future-proofs us as employers
// onboard via /post-job.
async function fetchOriginatedJobs(): Promise<FeedJob[]> {
  const nowIso = hourIso()
  const baseQ = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .gte('description_usable_chars', 250) // mirrors hasUsableDescription (2026-06)
    .eq('is_ats_import', false)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  const numBatches = await activeJobBatchCount(supabase)
  const batches = await Promise.all(
    Array.from({ length: numBatches }, (_, i) =>
      baseQ().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )
  return batches.flatMap((b) => (b.data ?? []) as unknown as FeedJob[])
}

// Indeed-format feed restricted to originated (non-ATS-imported) jobs.
// Designed for strict partners (Indeed, LinkedIn Limited Listings,
// ZipRecruiter Publisher Program) whose quality scoring penalizes
// republished content. Hand them
// https://freejobpost.co/feeds/originated.xml.
//
// Doesn't use a SyndicationTargetId (those represent per-board opt-in
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
  // Same thin-description filter as buildIndeedFormatFeed — strict
  // partners are even more sensitive to thin content than volume
  // partners. See hasUsableDescription() for context.
  const jobs = allJobs.filter((j) => hasUsableDescription(j.description))
  const employerNames = await resolveEmployerNames(jobs)
  const jobsXml = jobs
    .map((job) => {
      const name = employerNames.get(job.employer_id) || 'Ava Health Partners'
      // Inline the indeedFormatJobElement body to bypass the
      // jobUrlWithUtm SyndicationTargetId constraint. URL is the bare
      // canonical /jobs/[slug] — no ?ref, no utm_* — since strict
      // partners append their own attribution.
      const catTag = avaCategoryHashtag(job)
      const loc = locationLabel(job)
      const sal = formatSalary(job.salary_min, job.salary_max)
      const title = job.title || job.role || 'Healthcare Role'
      const posted = job.created_at ? rfc822(new Date(job.created_at)) : rfc822(new Date())
      const validThrough = job.expires_at
        ? rfc822(new Date(job.expires_at))
        : rfc822(new Date(Date.now() + 60 * 86400_000))
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
