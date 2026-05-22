// Computes viable (city, specialty) cells for the /city/[slug]/[specialty]
// matrix surface. A cell is viable when ≥5 active jobs match the
// specialty's matchPatterns AND match the city's cityMatchPatterns
// within the same state.
//
// Mirrors specialty-state-matrix.ts in structure. The two matrices live
// in separate files because the city dimension uses substring matching
// (NYC's borough variants) while the state dimension is an exact-abbr
// match — keeping the lookup logic separate avoids overgeneralizing one
// at the expense of the other.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { CITY_HUBS, type CityHub } from './city-slugs'

export type CityMatrixCell = {
  city: CityHub
  specialty: SpecialtyHub
  count: number
}

const MIN_JOBS_PER_CELL = 5

export { MIN_JOBS_PER_CELL }

let _cellCache: { at: number; value: CityMatrixCell[] } | null = null
const CELL_CACHE_TTL_MS = 10 * 60 * 1000

export async function getViableCityCellsCached(
  supabase: SupabaseClient,
): Promise<CityMatrixCell[]> {
  const now = Date.now()
  if (_cellCache && now - _cellCache.at < CELL_CACHE_TTL_MS) {
    return _cellCache.value
  }
  const value = await computeViableCityCellsViaSql(supabase)
  _cellCache = { at: now, value }
  return value
}

/**
 * The SQL-counted version. One big pull of active rows, JS-side per-field
 * matching. Returns cells in deterministic order (desc by count → city
 * slug → specialty slug).
 */
export async function computeViableCityCellsViaSql(
  supabase: SupabaseClient,
): Promise<CityMatrixCell[]> {
  // 12-batch range to bypass PostgREST's anon db_max_rows=1000 cap.
  // Matches the rest of the codebase (jobs.xml, sitemap, specialty-state
  // matrix all use 12 × 1000 = 12k row ceiling).
  const NUM_BATCHES = 12
  const BATCH_SIZE = 1000
  const nowIso = new Date().toISOString()
  const baseQ = () => supabase
    .from('public_jobs')
    .select('city, state, specialty, role, title')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
  const batches = await Promise.all(
    Array.from({ length: NUM_BATCHES }, (_, i) =>
      baseQ().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
    )
  )
  const jobs = batches.flatMap((b) => (b.data ?? [])) as Array<{
    city: string | null
    state: string | null
    specialty: string | null
    role: string | null
    title: string | null
  }>

  // Pre-index cities by state for O(1) lookup. Each state can have
  // multiple curated city hubs (FL has Tampa/Miami/Jax/Orlando).
  const citiesByState = new Map<string, CityHub[]>()
  for (const c of CITY_HUBS) {
    const list = citiesByState.get(c.state) ?? []
    list.push(c)
    citiesByState.set(c.state, list)
  }

  function specialtyMatches(job: { specialty: string | null; role: string | null; title: string | null }, patterns: readonly string[]): boolean {
    for (const field of [job.specialty, job.role, job.title]) {
      if (!field) continue
      const lower = field.toLowerCase()
      for (const p of patterns) {
        if (lower.includes(p.toLowerCase())) return true
      }
    }
    return false
  }

  function cityMatches(jobCity: string | null, patterns: readonly string[]): boolean {
    if (!jobCity) return false
    const lower = jobCity.toLowerCase()
    for (const p of patterns) {
      if (lower.includes(p)) return true
    }
    return false
  }

  const counts = new Map<string, CityMatrixCell>()

  for (const job of jobs) {
    if (!job.state || !job.city) continue
    const candidateCities = citiesByState.get(job.state)
    if (!candidateCities) continue
    const matchingCity = candidateCities.find((c) => cityMatches(job.city, c.cityMatchPatterns))
    if (!matchingCity) continue

    for (const specialty of SPECIALTY_HUBS) {
      if (!specialtyMatches(job, specialty.matchPatterns)) continue
      const key = `${matchingCity.slug}|${specialty.slug}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { city: matchingCity, specialty, count: 1 })
      }
    }
  }

  return Array.from(counts.values())
    .filter((c) => c.count >= MIN_JOBS_PER_CELL)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (a.city.slug !== b.city.slug) return a.city.slug.localeCompare(b.city.slug)
      return a.specialty.slug.localeCompare(b.specialty.slug)
    })
}
