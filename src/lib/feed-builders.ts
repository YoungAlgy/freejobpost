// Shared XML feed builder for Indeed-spec aggregators (Indeed, ZipRecruiter,
// Glassdoor, Adzuna, Jooble, Talent.com). They all eat a near-identical XML
// document, so we abstract the inner per-job element here and let each
// network's route just declare its filter target + minor format tweaks.
//
// LinkedIn is the outlier (different field names, ISO-8601 dates, snake-case
// jobtype) — see /feeds/linkedin.xml.

import type { PublicJob } from './public-jobs'
import { JOB_DETAIL_FIELDS, formatSalary, locationLabel } from './public-jobs'
import { supabase } from './supabase'
import type { SyndicationTargetId } from './syndication-targets'

export type FeedJob = PublicJob & {
  updated_at: string
  employer_id: string
  syndication_targets: SyndicationTargetId[]
}

export function cdata(s: string | null | undefined): string {
  const v = (s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${v}]]>`
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

export function descriptionHtml(job: PublicJob): string {
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

// Fetch active jobs that opt-in to a particular network.
//
// Defensive: if the syndication_targets column doesn't exist yet (migration
// not applied), fall back to returning every active job. This keeps every
// feed route serving content even if Algy hasn't pasted the SQL yet — the
// recruiter-opt-in story kicks in only after the column is live.
export async function fetchJobsForTarget(target: SyndicationTargetId): Promise<FeedJob[]> {
  const filtered = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id, syndication_targets')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .contains('syndication_targets', [target])
    .order('created_at', { ascending: false })
    .limit(5000)

  if (!filtered.error) {
    return (filtered.data ?? []) as unknown as FeedJob[]
  }

  // Fallback: no syndication_targets column → unfiltered feed.
  const fallback = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', updated_at, employer_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)
  return (fallback.data ?? []) as unknown as FeedJob[]
}

// Resolve company names for a batch of employer ids in one query.
export async function resolveEmployerNames(jobs: FeedJob[]): Promise<Map<string, string>> {
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
export function indeedFormatJobElement(job: FeedJob, employerName: string, sourceName: string): string {
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
export function wrapIndeedFormat(jobsXml: string, jobCount: number, networkLabel: string): string {
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

// One-call helper used by every Indeed-format feed route. Pass the target
// (e.g. 'indeed', 'adzuna') and a label for the description.
export async function buildIndeedFormatFeed(
  target: SyndicationTargetId,
  networkLabel: string,
): Promise<Response> {
  const jobs = await fetchJobsForTarget(target)
  const employerNames = await resolveEmployerNames(jobs)
  const jobsXml = jobs
    .map((job) => {
      const name = employerNames.get(job.employer_id) || 'Ava Health Partners'
      return indeedFormatJobElement(job, name, 'freejobpost.co')
    })
    .join('\n')
  const xml = wrapIndeedFormat(jobsXml, jobs.length, networkLabel)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
