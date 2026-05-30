// Workday public job-board fetcher.
//
// Workday is the dominant ATS for large hospital systems (Cleveland Clinic,
// AdventHealth, Mayo, HCA, Kaiser, etc.). Each company has a unique tenant URL
// and "site path" — e.g.
//   https://ccf.wd1.myworkdayjobs.com/ClevelandClinicCareers
//   https://adventhealth.wd12.myworkdayjobs.com/AH_External_Career_Site
//
// API:
//   POST {tenantHost}/wday/cxs/{tenant}/{site}/jobs
//     body: { limit: N, offset: M, searchText: "", appliedFacets: {} }
//     returns: { total, jobPostings: [{ title, externalPath, locationsText, timeType, postedOn, ... }] }
//   GET  {tenantHost}/wday/cxs/{tenant}/{site}/job/{externalPath}
//     returns: { jobPostingInfo: { title, jobDescription, location, ... } }
//
// The listing endpoint is fast but description-poor; the detail endpoint has
// the full HTML description. To keep refresh-cron tight, the fetcher only
// hits the detail endpoint for NEW jobs (by external_ref). Existing jobs get
// a shallow update from the listing data, preserving the cached description.
//
// Workday tenant configs live in seed-boards.ts (workdayTenant + workdaySite
// fields on the BoardConfig).

import type { ExternalJob, ImportResult } from './types'
import { parseUsLocation } from './locations'
import { isHealthcareRelevant } from './healthcare-filter'
import { htmlToText } from './html-to-text'

export interface WorkdayBoardCfg {
  /** Hostname like 'ccf.wd1.myworkdayjobs.com' */
  tenantHost: string
  /** Tenant name in URL (e.g. 'ccf' for ccf.wd1.myworkdayjobs.com) */
  tenant: string
  /** Site path (e.g. 'ClevelandClinicCareers') */
  site: string
  /** 2-letter US state to default jobs to when locationsText can't be parsed.
   *  Usually the company's HQ state. Brand-named facilities default here. */
  defaultState: string
}

interface WorkdayListingItem {
  title: string
  externalPath: string
  locationsText?: string
  timeType?: string         // 'Full time' | 'Part time'
  postedOn?: string
  jobDescription?: string   // some tenants include in listing, some don't
  remoteType?: string       // 'Fully Remote' | 'On-site' | 'Hybrid'
  bulletFields?: string[]
}
interface WorkdayListingResponse {
  total: number
  jobPostings: WorkdayListingItem[]
}

interface WorkdayDetailResponse {
  jobPostingInfo?: {
    id?: string
    title?: string
    jobDescription?: string  // HTML
    location?: string        // e.g. "Cleveland" or "Tampa, FL"
    locationsText?: string
    externalUrl?: string
    timeType?: string
    remoteType?: string
    workShift?: string
    // Workday only surfaces pay-range fields on the detail endpoint and only
    // when the employer has opted into pay-transparency display. Most tenants
    // leave these blank for confidentiality — extraction is best-effort.
    // Shape per CXS payload: numeric strings + an ISO currency code.
    payRangeMinimum?: string | number
    payRangeMaximum?: string | number
    payRangeFrequency?: string  // typically "Yearly" or "Hourly"
    payRangeCurrency?: string   // "USD"
  }
}

const TIME_MAP: Record<string, ExternalJob['employment_type']> = {
  'Full time': 'full_time',
  'Part time': 'part_time',
  'Per Diem': 'per_diem',
  'Per diem': 'per_diem',
  'Contractor': 'contract',
  'Contract': 'contract',
  'Temporary': 'contract',
  'Intern': 'internship',
  'Internship': 'internship',
}
const REMOTE_MAP: Record<string, ExternalJob['remote_hybrid']> = {
  'Fully Remote': 'remote',
  'Remote': 'remote',
  'On-site': 'onsite',
  'Onsite': 'onsite',
  'Hybrid': 'hybrid',
}

/**
 * Try to extract a US state from a Workday locationsText. Workday usually
 * returns brand-named facilities like "Cleveland Clinic Main Campus" or
 * "ADVENTHEALTH NORTH PINELLAS" rather than "City, ST" — those won't parse
 * with the standard location parser. Fallback: defaultState from the board
 * config (typically the company's HQ state).
 */
function parseWorkdayLocation(
  locText: string | undefined,
  defaultState: string,
  detailLocation: string | undefined,
): { city: string | null; state: string; remote: boolean } {
  const candidates = [detailLocation, locText].filter(Boolean) as string[]
  for (const raw of candidates) {
    const loc = parseUsLocation(raw)
    if (loc.us && loc.state) return { city: loc.city, state: loc.state, remote: loc.remote }
  }
  // Last-ditch: scan all 50 state names in the brand string
  const lower = (locText ?? '').toLowerCase()
  const STATE_NAMES: Record<string, string> = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
    'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
    ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
    'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
    tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
    washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  }
  for (const [name, abbr] of Object.entries(STATE_NAMES)) {
    if (lower.includes(name)) return { city: null, state: abbr, remote: false }
  }
  return { city: null, state: defaultState, remote: false }
}

/**
 * Fetch listing pages. Workday's max-per-page is typically 20.
 * Returns the raw listing items (no detail fetches yet).
 */
async function fetchAllListings(
  cfg: WorkdayBoardCfg,
): Promise<WorkdayListingItem[]> {
  const url = `https://${cfg.tenantHost}/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`
  const all: WorkdayListingItem[] = []
  const PAGE = 20
  let offset = 0
  let total = -1
  while (total === -1 || offset < total) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ limit: PAGE, offset, searchText: '', appliedFacets: {} }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Workday ${cfg.tenant} listing offset=${offset}: ${res.status}`)
    const data = (await res.json()) as WorkdayListingResponse
    all.push(...(data.jobPostings ?? []))
    if (total === -1) total = data.total
    offset += PAGE
    // Defensive cap
    if (all.length >= 10000) break
  }
  return all
}

/**
 * Fetch a single job's detail (full description + structured location).
 * externalPath comes from the listing item (e.g. '/job/Cleveland-Clinic-Main-Campus/Project-Manager-III---GME_334701').
 */
async function fetchDetail(
  cfg: WorkdayBoardCfg,
  externalPath: string,
): Promise<WorkdayDetailResponse | null> {
  try {
    const url = `https://${cfg.tenantHost}/wday/cxs/${cfg.tenant}/${cfg.site}${externalPath}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as WorkdayDetailResponse
  } catch {
    return null
  }
}

/**
 * Build the apply URL from the externalPath. The customer-facing apply page
 * lives at {tenantHost}/{site}/job/... (slightly different from the API path).
 */
function buildApplyUrl(cfg: WorkdayBoardCfg, externalPath: string): string {
  return `https://${cfg.tenantHost}/${cfg.site}${externalPath}`
}

/**
 * Main entry: fetches listings, optionally enriches via detail calls for
 * specific external_refs (typically those NOT already in the DB). For the
 * initial seed, pass enrichAll=true to fetch detail for every job.
 */
export async function fetchWorkdayBoard(
  cfg: WorkdayBoardCfg,
  options: { enrichAll?: boolean; enrichRefs?: Set<string> } = {},
): Promise<ImportResult> {
  const listings = await fetchAllListings(cfg)

  // droppedNonUs is a stub — the current Workday parseLocation always
  // resolves to a US state via defaultState fallback, so we never see
  // a non-US job to drop. Kept in the ImportResult shape so a future
  // strict-US-only filter can populate it without touching the type.
  const droppedNonUs = 0
  let droppedNonHealthcare = 0
  const jobs: ExternalJob[] = []

  for (const item of listings) {
    if (!isHealthcareRelevant(item.title, null)) {
      droppedNonHealthcare += 1
      continue
    }
    // For initial classification, treat the listing's facility text as the
    // location hint. We'll defer the state-extraction call until after we
    // know whether to enrich via detail.
    const externalRef = `workday:${cfg.tenant}/${cfg.site}:${item.externalPath}`

    const needsEnrich = options.enrichAll === true ||
      (options.enrichRefs !== undefined && options.enrichRefs.has(externalRef))

    let description = htmlToText(item.jobDescription ?? '')
    let detailLocation: string | undefined
    let salaryMin: number | null = null
    let salaryMax: number | null = null

    if (needsEnrich) {
      const detail = await fetchDetail(cfg, item.externalPath)
      if (detail?.jobPostingInfo) {
        description = htmlToText(detail.jobPostingInfo.jobDescription ?? '') || description
        detailLocation = detail.jobPostingInfo.location ?? undefined

        // Pay-range extraction. Only USD jobs map cleanly to our schema
        // (single-currency ExternalJob.salary_min/max). Yearly frequency is
        // preserved as-is; hourly is annualized to a 2080-hour year so the
        // downstream JobPosting JSON-LD can emit a consistent unitText. Any
        // currency other than USD is ignored to avoid mixing.
        const info = detail.jobPostingInfo
        const currency = (info.payRangeCurrency ?? '').toUpperCase()
        if (currency === '' || currency === 'USD') {
          const rawMin = info.payRangeMinimum
          const rawMax = info.payRangeMaximum
          const min = typeof rawMin === 'number' ? rawMin : rawMin ? Number(rawMin) : NaN
          const max = typeof rawMax === 'number' ? rawMax : rawMax ? Number(rawMax) : NaN
          const freq = (info.payRangeFrequency ?? '').toLowerCase()
          const annualize = freq === 'hourly' ? 2080 : 1
          if (Number.isFinite(min) && min > 0) salaryMin = Math.round(min * annualize)
          if (Number.isFinite(max) && max > 0) salaryMax = Math.round(max * annualize)
          // Clamp absurd annualized values to null. public_jobs.salary_min/max
          // are int4 (max ~2.147B); a Workday tenant mislabeling an already-
          // annual figure as "hourly" (× 2080) can exceed int4 and abort the
          // entire upsert chunk on write (silently dropping ~50 jobs). No real
          // healthcare salary exceeds ~$2M/yr, so treat anything above that as
          // bad data and null it (= "no salary published") rather than overflow.
          // 2026-05-30 hardening (the live edge-fn ingest already gates on
          // isUsdAnnual + never ×2080, so this protects the Node-lib/script path).
          const SALARY_CEILING = 2_000_000
          if (salaryMin !== null && salaryMin > SALARY_CEILING) salaryMin = null
          if (salaryMax !== null && salaryMax > SALARY_CEILING) salaryMax = null
          // Drop nonsensical ranges (min > max) to avoid bad JSON-LD downstream.
          if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
            salaryMin = null
            salaryMax = null
          }
        }
      }
    }

    const parsed = parseWorkdayLocation(item.locationsText, cfg.defaultState, detailLocation)
    // US filter: parseWorkdayLocation always returns a state (fallback to
    // defaultState), so non-US filtering is implicit. If we wanted strict
    // US-only we'd check locationsText for non-US markers.
    const remote_hybrid: ExternalJob['remote_hybrid'] =
      REMOTE_MAP[item.remoteType ?? ''] ?? (parsed.remote ? 'remote' : 'onsite')

    jobs.push({
      external_id: item.externalPath,
      title: item.title,
      description,
      apply_url: buildApplyUrl(cfg, item.externalPath),
      city: parsed.city,
      state: parsed.state,
      remote_hybrid,
      employment_type: TIME_MAP[item.timeType ?? ''] ?? 'full_time',
      salary_min: salaryMin,
      salary_max: salaryMax,
      source: `workday:${cfg.tenant}/${cfg.site}`,
      updated_at: new Date().toISOString(),
    })
  }

  return {
    provider: 'workday' as const,
    boardSlug: `${cfg.tenant}/${cfg.site}`,
    totalFetched: listings.length,
    totalUsKept: jobs.length,
    droppedNonUs,
    droppedNonHealthcare,
    jobs,
  }
}
