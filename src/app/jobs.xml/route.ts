// Indeed v2 + Google for Jobs + ZipRecruiter compatible XML job feed.
//
// Feed URL: https://freejobpost.co/jobs.xml
//
// This is THE "post everywhere for free" endpoint. Submit this URL to:
//   - Google Search Console → Jobs → Add feed
//   - Indeed Free Organic XML Feed (https://employers.indeed.com/p/resources/free-posting)
//   - ZipRecruiter partner feed intake
//   - LinkedIn Limited Listings via content feed
//
// Each aggregator ingests, parses, and lists. Indeed re-syndicates to its
// partner network. Google for Jobs uses the JobPosting JSON-LD we already
// emit on each /jobs/[slug] page as the primary signal — this feed is the
// discovery path that tells Google (and everyone else) which slugs to crawl.
//
// Spec references (as of Apr 2026):
//   - Indeed v2 XML: https://docs.indeed.com/direct-job-posting/xml-feed
//   - Google for Jobs JobPosting: https://developers.google.com/search/docs/appearance/structured-data/job-posting
//   - ZipRecruiter XML: mirrors Indeed format with <source> root

import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
} from '@/lib/public-jobs'

// Refresh the feed every 15 minutes — aggregators re-crawl on their own
// schedule (Indeed ~4h, Google ~24h) so sub-hour ISR is overkill, but we
// keep it moving.
export const revalidate = 900
export const dynamic = 'force-static'

// Escape content for CDATA sections. CDATA lets us keep the HTML description
// readable without double-escaping every entity, but we still have to guard
// against the literal "]]>" sequence ending the section early.
function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
}

// Indeed's enum for employment type. We also keep our richer native enum
// stored in the DB — this is just the feed projection.
function indeedJobType(t: PublicJob['employment_type']): string {
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

// Build an HTML description suitable for the <description> CDATA. Google for
// Jobs wants structured markup; Indeed wants HTML but will strip most tags.
// Common denominator: paragraph + basic formatting, no scripts/iframes.
function descriptionHtml(job: PublicJob): string {
  const src = (job.description ?? '')
  // Convert our **Label:** lines + blank-line paragraphs → <p> + <strong>
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

function iso822(d: Date): string {
  // RFC 822 date format — what both Indeed and ZipRecruiter expect.
  return d.toUTCString()
}

export async function GET(): Promise<Response> {
  // /jobs.xml is the legacy "everything" feed (every active job, regardless
  // of per-network opt-in). The per-network feeds live at /feeds/<network>.xml
  // and respect the recruiter's syndication_targets choices.
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  type FeedJob = PublicJob & { updated_at: string; employer_id: string }
  const jobs = (data ?? []) as unknown as FeedJob[]

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

  const now = iso822(new Date())

  const jobsXml = jobs
    .map((job) => {
      const loc = locationLabel(job)
      const sal = formatSalary(job.salary_min, job.salary_max)
      const title = job.title || job.role || 'Healthcare Role'
      const posted = job.created_at ? iso822(new Date(job.created_at)) : now
      const validThrough = job.expires_at
        ? iso822(new Date(job.expires_at))
        : iso822(new Date(Date.now() + 60 * 86400_000))
      const employerName = employerNameMap.get(job.employer_id) || 'Ava Health Partners'
      return `  <job>
    <title>${cdata(title)}</title>
    <date>${cdata(posted)}</date>
    <expirationdate>${cdata(validThrough)}</expirationdate>
    <referencenumber>${cdata(job.slug)}</referencenumber>
    <url>${cdata(`https://freejobpost.co/jobs/${job.slug}`)}</url>
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
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
