// The job-list query behind every paginated hub page.
//
// WHY THIS MODULE EXISTS: as of the 2026-08-19 CPU fix (see
// src/lib/hub-pagination.ts) each hub is served by TWO routes — the bare hub
// path for page 1 and a /p/<n> continuation route for the rest. Both must fetch
// byte-identically, or page 2 shows a different slice of a differently-ordered
// corpus than page 1 skipped, and jobs silently vanish from the paginated
// series. The repo already has scar tissue for exactly this failure mode: the
// specialty `.or()` filter was inlined in two page files and drifted into the
// 2026-05-22 PostgREST double-encoding bug (commit 6e2b839), which is why
// src/lib/specialty-filter.ts exists. Same lesson, applied before the bug.
//
// Each fetch is capped at its family's HUB_JOB_LIMIT. That cap is the total
// corpus the hub exposes (unchanged from before pagination) — HUB_PAGE_SIZE
// then decides how much of it renders per URL.

import { supabase, hourIso, assertFreshOrThrow } from '@/lib/supabase'
import { JOB_LIST_FIELDS, type PublicJob } from '@/lib/public-jobs'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'
import { agencyOrFilter, type FederalAgency } from '@/lib/federal-agencies'
import { getOrComputeCached } from '@/lib/db-cache'

// 🔴 2026-08-21 CPU/disk-IO EXHAUSTION INCIDENT — the federal agency/agency+state
// job list + count fetches below (agencyOrFilter expands to up to 22 ILIKE
// clauses across title+description per call, e.g. DoD's 11 keywords × 2
// columns) were the one query family in this hub-page surface that never got
// the Postgres-backed cache wrapper its sibling matrix computations got after
// nearly identical incidents on 2026-06 and 2026-08-13 (see
// specialty-state-matrix.ts, city-specialty-matrix.ts, federal-state-matrix.ts).
// Every render of /jobs/federal/[agency] and /jobs/federal/[agency]/[state]
// (~50-80 agency×state combos) ran 1-2 of these uncached, and Next's
// `revalidate` export has already been proven unreliable on this OpenNext/
// Cloudflare deploy (see specialty-state-matrix.ts's 2026-08-13 note) — this
// was the direct cause of a multi-hour shared-DB outage (CPU pegged 100%,
// disk I/O budget exhausted, connection pool starved, real 504s on unrelated
// job-detail lookups). Same fix as its siblings: wrap in getOrComputeCached,
// 6h TTL. JOB_LIST_FIELDS has no `description`, so even the federalAgency cap
// of 500 rows stays far under set_matrix_cache's 1 MiB limit (the exact cap
// that broke the specialty matrix's cache on 2026-08-19 when it was caching
// hydrated, description-bearing objects instead).
const FEDERAL_AGENCY_CACHE_TTL_SECONDS = 21600 // 6h, matches every sibling matrix cache

/**
 * Total jobs each hub family exposes across all of its pages. These are the
 * pre-existing `.limit()` values, deliberately unchanged: pagination splits the
 * same corpus across more URLs, it does not shrink it. Nothing that was
 * reachable before this change became unreachable after it.
 */
export const HUB_JOB_LIMITS = {
  state: 300,
  specialty: 300,
  city: 200,
  specialtyState: 200,
  federalAgency: 500,
  federalAgencyState: 200,
} as const

/** Case-insensitive substring match over any of a city hub's name patterns. */
export function cityOrFilter(patterns: readonly string[]): string {
  return patterns.map((p) => `city.ilike.%${p}%`).join(',')
}

// ─── /state/[slug] ───────────────────────────────────────────────────────────

export async function fetchStateHubJobs(stateAbbr: string): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.state)
  assertFreshOrThrow(result, 'fetchStateHubJobs')
  return (result.data ?? []) as PublicJob[]
}

// ─── /specialty/[slug] ───────────────────────────────────────────────────────

export async function fetchSpecialtyHubJobs(
  matchPatterns: readonly string[],
): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(buildSpecialtyOrFilter(matchPatterns))
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.specialty)
  assertFreshOrThrow(result, 'fetchSpecialtyHubJobs')
  return (result.data ?? []) as PublicJob[]
}

// ─── /city/[slug] ────────────────────────────────────────────────────────────

export async function fetchCityHubJobs(
  cityMatchPatterns: readonly string[],
  stateAbbr: string,
): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.city)
  assertFreshOrThrow(result, 'fetchCityHubJobs')
  return (result.data ?? []) as PublicJob[]
}

export async function fetchCityHubJobCount(
  cityMatchPatterns: readonly string[],
  stateAbbr: string,
): Promise<number> {
  const result = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
  assertFreshOrThrow(result, 'fetchCityHubJobCount')
  return result.count ?? 0
}

// ─── /specialty/[slug]/[state] ───────────────────────────────────────────────

export async function fetchSpecialtyStateCellJobs(
  matchPatterns: readonly string[],
  stateAbbr: string,
): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .eq('state', stateAbbr)
    .or(buildSpecialtyOrFilter(matchPatterns))
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.specialtyState)
  assertFreshOrThrow(result, 'fetchSpecialtyStateCellJobs')
  return (result.data ?? []) as PublicJob[]
}

// ─── /jobs/federal/[agency] ──────────────────────────────────────────────────
//
// The federal family orders by `updated_at` (USAJobs re-syncs bump it) where the
// others order by `created_at`. Preserved exactly as it was.

// set_matrix_cache requires its value to be a JSON array of objects (see the
// 2026-08-20 shape-hardening migration) — counts are cached as a one-element
// [{ count }] array to satisfy that, unwrapped immediately after.
type CountRow = { count: number }

export async function fetchTotalFederalJobCount(): Promise<number> {
  const [row] = await getOrComputeCached<CountRow[]>(
    supabase,
    'federal_total_count',
    FEDERAL_AGENCY_CACHE_TTL_SECONDS,
    async () => {
      const result = await supabase
        .from('public_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', hourIso())
      assertFreshOrThrow(result, 'fetchTotalFederalJobCount')
      return [{ count: result.count ?? 0 }]
    },
  )
  return row?.count ?? 0
}

export async function fetchFederalAgencyJobs(
  agency: FederalAgency,
): Promise<PublicJob[]> {
  return getOrComputeCached(
    supabase,
    `federal_agency_jobs:${agency.slug}`,
    FEDERAL_AGENCY_CACHE_TTL_SECONDS,
    async () => {
      const result = await supabase
        .from('public_jobs')
        .select(JOB_LIST_FIELDS)
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', hourIso())
        .or(agencyOrFilter(agency))
        .order('updated_at', { ascending: false })
        .limit(HUB_JOB_LIMITS.federalAgency)
      assertFreshOrThrow(result, 'fetchFederalAgencyJobs')
      return (result.data ?? []) as PublicJob[]
    },
  )
}

export async function fetchFederalAgencyJobCount(
  agency: FederalAgency,
): Promise<number | null> {
  const [row] = await getOrComputeCached<CountRow[]>(
    supabase,
    `federal_agency_count:${agency.slug}`,
    FEDERAL_AGENCY_CACHE_TTL_SECONDS,
    async () => {
      const result = await supabase
        .from('public_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', hourIso())
        .or(agencyOrFilter(agency))
      assertFreshOrThrow(result, 'fetchFederalAgencyJobCount')
      return [{ count: result.count ?? 0 }]
    },
  )
  return row?.count ?? null
}

// ─── /jobs/federal/[agency]/[state] ──────────────────────────────────────────

export async function fetchFederalAgencyStateJobs(
  agency: FederalAgency,
  stateAbbr: string,
): Promise<PublicJob[]> {
  return getOrComputeCached(
    supabase,
    `federal_agency_state_jobs:${agency.slug}:${stateAbbr}`,
    FEDERAL_AGENCY_CACHE_TTL_SECONDS,
    async () => {
      const result = await supabase
        .from('public_jobs')
        .select(JOB_LIST_FIELDS)
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', hourIso())
        .eq('state', stateAbbr)
        .or(agencyOrFilter(agency))
        .order('updated_at', { ascending: false })
        .limit(HUB_JOB_LIMITS.federalAgencyState)
      assertFreshOrThrow(result, 'fetchFederalAgencyStateJobs')
      return (result.data ?? []) as PublicJob[]
    },
  )
}

export async function fetchFederalAgencyStateJobCount(
  agency: FederalAgency,
  stateAbbr: string,
): Promise<number | null> {
  const [row] = await getOrComputeCached<CountRow[]>(
    supabase,
    `federal_agency_state_count:${agency.slug}:${stateAbbr}`,
    FEDERAL_AGENCY_CACHE_TTL_SECONDS,
    async () => {
      const result = await supabase
        .from('public_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', hourIso())
        .eq('state', stateAbbr)
        .or(agencyOrFilter(agency))
      assertFreshOrThrow(result, 'fetchFederalAgencyStateJobCount')
      return [{ count: result.count ?? 0 }]
    },
  )
  return row?.count ?? null
}
