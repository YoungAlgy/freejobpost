// Lever public postings fetcher.
//
// Docs: https://github.com/lever/postings-api
// Endpoint: https://api.lever.co/v0/postings/{site}?mode=json
// Auth:     none for listings (publicly readable)
// Rate:     no documented limit on listing; submissions are throttled separately
//
// Lever's response is friendlier than Greenhouse in two ways:
//   1. workplaceType field is already 'remote' | 'onsite' | 'hybrid'
//   2. descriptionPlain is already stripped of HTML
//
// Downside: locations are free-text and frequently non-US (Lyra Health, for
// example, has 200+ India/Tokyo postings). The US filter does the heavy lift.

import type { ExternalJob, ImportResult } from './types'
import { parseUsLocation } from './locations'
import { isHealthcareRelevant } from './healthcare-filter'

interface LeverCategories {
  location?: string
  team?: string
  commitment?: string
  department?: string
}
interface LeverSalaryRange {
  min?: number
  max?: number
  currency?: string
  interval?: string // 'per-year-salary' | 'per-hour-wage' | etc.
}
interface LeverPosting {
  id: string
  text: string
  categories?: LeverCategories
  description?: string
  descriptionPlain?: string
  hostedUrl?: string
  applyUrl?: string
  workplaceType?: 'remote' | 'onsite' | 'hybrid' | string
  salaryRange?: LeverSalaryRange
  createdAt?: number // ms
  updatedAt?: number // ms
}

const COMMITMENT_MAP: Record<string, ExternalJob['employment_type']> = {
  'full-time': 'full_time',
  fulltime: 'full_time',
  'part-time': 'part_time',
  parttime: 'part_time',
  contract: 'contract',
  contractor: 'contract',
  temporary: 'contract',
  'per-diem': 'per_diem',
  perdiem: 'per_diem',
  intern: 'internship',
  internship: 'internship',
}

function normalizeCommitment(c: string | undefined): ExternalJob['employment_type'] {
  if (!c) return 'full_time'
  const k = c.toLowerCase().replace(/\s+/g, '-')
  return COMMITMENT_MAP[k] ?? 'full_time'
}

function normalizeWorkplace(w: string | undefined, parsedRemote: boolean): ExternalJob['remote_hybrid'] {
  if (parsedRemote) return 'remote'
  if (w === 'remote' || w === 'hybrid' || w === 'onsite') return w
  return 'onsite'
}

/**
 * Normalize Lever's salary range to annual USD min/max.
 *
 * Lever supports hourly + monthly intervals — we only keep annual USD because
 * the public_jobs schema is annual USD. Anything else is dropped to null
 * rather than mis-stated.
 */
function normalizeSalary(
  sal: LeverSalaryRange | undefined,
): { min: number | null; max: number | null } {
  if (!sal) return { min: null, max: null }
  if (sal.currency && sal.currency !== 'USD') return { min: null, max: null }
  const interval = (sal.interval ?? '').toLowerCase()
  // Annual only: the public_jobs schema is annual USD. Lever's annual interval
  // is 'per-year-salary'. Reject hourly/daily/weekly/monthly/quarterly/half-yearly
  // (and one-time) intervals, which would otherwise be mis-stated as annual. Note
  // 'per-half-year-salary' contains "year" + "salary", so an includes-based check
  // needs the explicit 'half' guard.
  const isAnnual = !interval || (interval.includes('year') && !interval.includes('half'))
  if (!isAnnual) {
    return { min: null, max: null }
  }
  return {
    min: typeof sal.min === 'number' ? sal.min : null,
    max: typeof sal.max === 'number' ? sal.max : null,
  }
}

export async function fetchLeverBoard(siteSlug: string): Promise<ImportResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(siteSlug)}?mode=json`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    throw new Error(`Lever board "${siteSlug}" returned ${res.status}`)
  }
  const raw = (await res.json()) as LeverPosting[]

  let droppedNonUs = 0
  let droppedNonHealthcare = 0
  const jobs: ExternalJob[] = []

  for (const p of raw) {
    const dept = p.categories?.department ?? p.categories?.team ?? null
    if (!isHealthcareRelevant(p.text, dept)) {
      droppedNonHealthcare += 1
      continue
    }
    const loc = parseUsLocation(p.categories?.location)
    if (!loc.us) {
      droppedNonUs += 1
      continue
    }
    const apply = p.applyUrl ?? p.hostedUrl ?? `https://jobs.lever.co/${siteSlug}/${p.id}`
    const description = p.descriptionPlain && p.descriptionPlain.length > 0
      ? p.descriptionPlain
      : (p.description ?? '').replace(/<[^>]+>/g, '').trim()
    const { min, max } = normalizeSalary(p.salaryRange)
    const updatedAtMs = p.updatedAt ?? p.createdAt ?? Date.now()

    jobs.push({
      external_id: p.id,
      title: p.text,
      description,
      apply_url: apply,
      city: loc.city,
      state: loc.state,
      remote_hybrid: normalizeWorkplace(p.workplaceType, loc.remote),
      employment_type: normalizeCommitment(p.categories?.commitment),
      salary_min: min,
      salary_max: max,
      source: `lever:${siteSlug}`,
      updated_at: new Date(updatedAtMs).toISOString(),
    })
  }

  return {
    provider: 'lever',
    boardSlug: siteSlug,
    totalFetched: raw.length,
    totalUsKept: jobs.length,
    droppedNonUs,
    droppedNonHealthcare,
    jobs,
  }
}
