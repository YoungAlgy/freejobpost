// Ashby public job-board fetcher.
//
// Docs: https://developers.ashbyhq.com/reference/public-job-board
// Endpoint: https://api.ashbyhq.com/posting-api/job-board/{site}
// Auth:     none (publicly readable)
//
// Ashby is the modern ATS adopted by many healthcare-tech startups
// (Talkiatry, Headway, Found). Response is friendlier than Lever in that
// workplaceType is already 'Remote' | 'Hybrid' | 'OnSite' and the
// address.postalAddress block gives clean city/state separately.

import type { ExternalJob, ImportResult } from './types'
import { parseUsLocation } from './locations'
import { isHealthcareRelevant } from './healthcare-filter'
import { htmlToText } from './html-to-text'

interface AshbyAddress {
  postalAddress?: {
    addressLocality?: string  // city, e.g. "Savannah"
    addressRegion?: string    // full state name, e.g. "Georgia"
    addressCountry?: string   // "United States" or 2-letter
  }
}
interface AshbyJob {
  id: string
  title: string
  department?: string
  team?: string
  employmentType?: string  // 'FullTime' | 'PartTime' | 'Contract' | 'Intern' | etc.
  location?: string         // "City, ST" string
  isRemote?: boolean
  workplaceType?: string    // 'Remote' | 'Hybrid' | 'OnSite'
  address?: AshbyAddress
  jobUrl?: string
  applyUrl?: string
  publishedAt?: string
  updatedAt?: string
  descriptionHtml?: string
  descriptionPlain?: string
  descriptionSocial?: string
}
interface AshbyResponse {
  jobs: AshbyJob[]
}

const EMPLOYMENT_MAP: Record<string, ExternalJob['employment_type']> = {
  FullTime: 'full_time',
  'Full-Time': 'full_time',
  PartTime: 'part_time',
  'Part-Time': 'part_time',
  Contract: 'contract',
  Contractor: 'contract',
  Temporary: 'contract',
  Intern: 'internship',
  Internship: 'internship',
}

function normalizeAshbyEmployment(t: string | undefined): ExternalJob['employment_type'] {
  if (!t) return 'full_time'
  return EMPLOYMENT_MAP[t] ?? 'full_time'
}

function normalizeAshbyWorkplace(
  job: AshbyJob,
  parsedRemote: boolean,
): ExternalJob['remote_hybrid'] {
  if (parsedRemote || job.isRemote === true || job.workplaceType === 'Remote') return 'remote'
  if (job.workplaceType === 'Hybrid') return 'hybrid'
  return 'onsite'
}

export async function fetchAshbyBoard(siteSlug: string): Promise<ImportResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(siteSlug)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Ashby board "${siteSlug}" returned ${res.status}`)
  const data = (await res.json()) as AshbyResponse
  const raw = data.jobs ?? []

  let droppedNonUs = 0
  let droppedNonHealthcare = 0
  const jobs: ExternalJob[] = []

  for (const j of raw) {
    const dept = j.department ?? j.team ?? null
    if (!isHealthcareRelevant(j.title, dept)) {
      droppedNonHealthcare += 1
      continue
    }
    // Prefer the structured address fields; fall back to the location string.
    const region = j.address?.postalAddress?.addressRegion
    const locality = j.address?.postalAddress?.addressLocality
    const locInput = region ? (locality ? `${locality}, ${region}` : region) : j.location ?? ''
    const loc = parseUsLocation(locInput)
    if (!loc.us) {
      droppedNonUs += 1
      continue
    }
    const apply = j.applyUrl ?? j.jobUrl ?? `https://jobs.ashbyhq.com/${siteSlug}/${j.id}`
    const description = j.descriptionPlain
      ? j.descriptionPlain
      : j.descriptionHtml
        ? htmlToText(j.descriptionHtml)
        : (j.descriptionSocial ?? '')
    const updatedAt = j.updatedAt ?? j.publishedAt ?? new Date().toISOString()

    jobs.push({
      external_id: j.id,
      title: j.title,
      description,
      apply_url: apply,
      city: loc.city,
      state: loc.state,
      remote_hybrid: normalizeAshbyWorkplace(j, loc.remote),
      employment_type: normalizeAshbyEmployment(j.employmentType),
      salary_min: null,  // Ashby public board doesn't expose salary
      salary_max: null,
      source: `ashby:${siteSlug}`,
      updated_at: updatedAt,
    })
  }

  return {
    provider: 'ashby',
    boardSlug: siteSlug,
    totalFetched: raw.length,
    totalUsKept: jobs.length,
    droppedNonUs,
    droppedNonHealthcare,
    jobs,
  }
}
