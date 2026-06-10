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
import { unstable_cache } from 'next/cache'
import { supabase as _moduleSupabase, hourIso } from './supabase'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { CITY_HUBS, type CityHub } from './city-slugs'
import { activeJobBatchCount } from './active-batch-count'

export type CityMatrixCell = {
  city: CityHub
  specialty: SpecialtyHub
  count: number
}

const MIN_JOBS_PER_CELL = 5

export { MIN_JOBS_PER_CELL }

/**
 * 🔴 2026-06 INCIDENT FIX (same root cause as specialty-state-matrix). The
 * per-process `_cellCache` did NOT survive cold serverless instances, so every
 * city-matrix / sitemap render re-ran the full 40-batch corpus scan → shared
 * pool exhaustion. Now wrapped in Next's data cache: ≤ one scan per 10min
 * globally, across all instances.
 */
const _cachedViableCityCells = unstable_cache(
  _computeViableCityCellsUncached,
  ['viable-city-matrix-cells-v2'],
  { revalidate: 600 },
)

export async function getViableCityCellsCached(
  _supabase?: SupabaseClient,
): Promise<CityMatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  return _cachedViableCityCells()
}

/**
 * Thin wrapper over the globally-cached scan (kept for existing callers —
 * generateStaticParams, sitemap). No longer scans per render.
 */
export async function computeViableCityCellsViaSql(
  _supabase?: SupabaseClient,
): Promise<CityMatrixCell[]> {
  void _supabase
  return _cachedViableCityCells()
}

async function _computeViableCityCellsUncached(): Promise<CityMatrixCell[]> {
  const numBatches = await activeJobBatchCount(_moduleSupabase)
  const BATCH_SIZE = 1000
  const nowIso = hourIso()
  const baseQ = () => _moduleSupabase
    .from('public_jobs')
    .select('city, state, specialty, role, title')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  const batches = await Promise.all(
    Array.from({ length: numBatches }, (_, i) =>
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
