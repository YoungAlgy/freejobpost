// LinkedIn Job Wrapping XML feed.
//
// Feed URL: https://freejobpost.co/feeds/linkedin.xml
//
// LinkedIn requires a separate XML format from Indeed/ZipRecruiter. Key
// differences:
//   - Date format: ISO 8601 (2026-07-26), NOT RFC 2822
//   - <partnerJobId> instead of <referencenumber>
//   - <applyUrl> instead of <url>
//   - <jobtype> in SCREAMING_SNAKE_CASE (FULL_TIME, PART_TIME, CONTRACT, ...)
//   - <industryCodes> numeric (14 = Hospital & Health Care)
//   - <salary> formatted as "CURRENCY MIN MAX PERIOD"
//
// To enable distribution to LinkedIn:
//   1. Submit the feed URL to LinkedIn via your LinkedIn Recruiter rep
//      (job wrapping is gated — they need to whitelist the feed)
//   2. LinkedIn polls every 4–24 hours, syndicates as Limited Listings
//   3. Sponsored jobs unlock paid promotion on top of free wrapping
//
// Spec reference: LinkedIn Talent Solutions — Job Wrapping XML Specification
// (current as of 2026; obtain the latest from your LinkedIn account team).

import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  locationLabel,
} from '@/lib/public-jobs'
import { jobUrlWithUtm } from '@/lib/feed-builders'

// 6h ISR: LinkedIn polls every 4–24h (see header), so sub-hour regen was
// pure Vercel invocation cost (2026-05-28 cost pass). See jobs.xml rationale.
export const revalidate = 21600

function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
}

// LinkedIn enum: FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERNSHIP,
// VOLUNTEER, OTHER. We map locum + per_diem to TEMPORARY.
function linkedinJobType(t: PublicJob['employment_type']): string {
  switch (t) {
    case 'full_time': return 'FULL_TIME'
    case 'part_time': return 'PART_TIME'
    case 'contract': return 'CONTRACT'
    case 'locum': return 'TEMPORARY'
    case 'per_diem': return 'TEMPORARY'
    case 'internship': return 'INTERNSHIP'
    default: return 'FULL_TIME'
  }
}

// LinkedIn salary format: "CURRENCY MIN MAX PERIOD"
//   periods: YEAR, MONTH, BIWEEKLY, WEEK, DAY, HOUR
// All Ava jobs are stored as annual salaries today.
function linkedinSalary(min: number | null, max: number | null): string {
  if (!min && !max) return ''
  const lo = min ?? max ?? 0
  const hi = max ?? min ?? 0
  return `USD ${lo.toFixed(2)} ${hi.toFixed(2)} YEAR`
}

function descriptionHtml(job: PublicJob): string {
  const src = (job.description ?? '')
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

// LinkedIn wants ISO 8601 (yyyy-mm-dd). Use UTC date so feed is deterministic.
function iso8601Date(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// PostgREST anon-role default db_max_rows=1000 silently clamps a single
// .limit(N>1000). Same 12-batch pattern as the other partner feeds and
// /jobs.xml — see src/lib/feed-builders.ts. Pre-fix 2026-05-21 audit:
// /feeds/linkedin.xml was returning 1,000 of ~9,600 active jobs.
const NUM_BATCHES = 12
const BATCH_SIZE = 1000

export async function GET(): Promise<Response> {
  // STRICT PARTNER: LinkedIn requires EXPLICIT opt-in. Empty arrays are NOT
  // auto-included — see feed-builders.ts STRICT_PARTNERS for the canonical
  // list (indeed/linkedin/ziprecruiter). We never republish ATS-aggregated
  // jobs to LinkedIn without a recruiter's deliberate choice; LinkedIn's
  // Job Wrapping quality scoring penalizes feeds heavy on republished
  // content. Pre-2026-05-20 audit confirmed 425 explicitly-opted-in jobs
  // is the correct number for this surface.
  const nowIso = new Date().toISOString()
  const baseFiltered = () => supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id, syndication_targets')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .contains('syndication_targets', ['linkedin'])
    .order('updated_at', { ascending: false })

  const filteredBatches = await Promise.all(
    Array.from({ length: NUM_BATCHES }, (_, i) =>
      baseFiltered().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )

  // Pre-migration fallback: if column doesn't exist, fetch unfiltered. Use
  // the first batch's error status as the signal (the others would error
  // identically).
  let data: unknown[] | null
  if (filteredBatches[0]?.error) {
    const baseFallback = () => supabase
      .from('public_jobs')
      .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
    const fallbackBatches = await Promise.all(
      Array.from({ length: NUM_BATCHES }, (_, i) =>
        baseFallback().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
      )
    )
    data = fallbackBatches.flatMap((b) => (b.data ?? []) as unknown[])
  } else {
    data = filteredBatches.flatMap((b) => (b.data ?? []) as unknown[])
  }

  type FeedJob = PublicJob & { updated_at: string; employer_id: string }
  // Filter thin descriptions before publishing to LinkedIn. LinkedIn Job
  // Wrapping quality scoring penalizes thin-content feeds; see
  // src/lib/feed-builders.ts hasUsableDescription() for the canonical
  // ≥50-char rule (post-strip-HTML, post-whitespace-collapse). Pre-2026-05-21
  // audit: 24% of corpus has empty/<p></p>-only descriptions from
  // Workday-shallow-refresh imports.
  const allJobs = (data ?? []) as unknown as FeedJob[]
  const jobs = allJobs.filter((j) => {
    const stripped = (j.description ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return stripped.length >= 50
  })

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

  const now = new Date().toUTCString()

  const jobsXml = jobs
    .map((job) => {
      const loc = locationLabel(job)
      const title = job.title || job.role || 'Healthcare Role'
      const validThrough = job.expires_at
        ? iso8601Date(new Date(job.expires_at))
        : iso8601Date(new Date(Date.now() + 60 * 86400_000))
      const employerName = employerNameMap.get(job.employer_id) || 'Ava Health Partners'
      return `  <job>
    <partnerJobId>${cdata(job.slug)}</partnerJobId>
    <company>${cdata(employerName)}</company>
    <title>${cdata(title)}</title>
    <description>${cdata(descriptionHtml(job))}</description>
    <applyUrl>${cdata(jobUrlWithUtm(job.slug, 'linkedin'))}</applyUrl>
    <expirationDate>${cdata(validThrough)}</expirationDate>
    <jobtype>${cdata(linkedinJobType(job.employment_type))}</jobtype>
    <industryCodes>${cdata('14')}</industryCodes>
    <city>${cdata(job.city ?? '')}</city>
    <state>${cdata(job.state ?? '')}</state>
    <country>${cdata('US')}</country>
    <location>${cdata(loc)}</location>
    <salary>${cdata(linkedinSalary(job.salary_min, job.salary_max))}</salary>
    <category>${cdata(job.specialty ?? job.role ?? 'Healthcare')}</category>
  </job>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>freejobpost.co</publisher>
  <publisherurl>https://freejobpost.co</publisherurl>
  <lastBuildDate>${now}</lastBuildDate>
  <description>Free healthcare job feed — LinkedIn Job Wrapping spec — operated by Ava Health Partners LLC. ${jobs.length} open positions.</description>
${jobsXml}
</source>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
