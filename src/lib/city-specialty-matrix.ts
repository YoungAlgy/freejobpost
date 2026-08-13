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
import { supabase as _moduleSupabase } from './supabase'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { CITY_HUBS, type CityHub } from './city-slugs'

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
  // 6h (was 600s) — full-corpus scan; see specialty-state-matrix note. Cuts the
  // shared-MICRO scan load ~36× with negligible freshness cost.
  { revalidate: 21600 },
)

export async function getViableCityCellsCached(
  _supabase?: SupabaseClient,
): Promise<CityMatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  return _cachedViableCityCells()
}

// 🔴 2026-08-13 — same fix, same reasoning as specialty-state-matrix.ts's
// sibling comment: the JS full-corpus scan (with or without the concurrency
// cap this file never got) depends on the app-level unstable_cache actually
// holding, and a live incident audit found it wasn't. This is the
// higher-stakes of the two — it's called from /jobs/[slug], the app's
// highest-traffic route. Delegates to compute_viable_city_matrix_cells
// (migration 20260813), a single indexed SQL aggregate, so a cache miss
// here is now cheap regardless.
async function _computeViableCityCellsUncached(): Promise<CityMatrixCell[]> {
  const { data, error } = await _moduleSupabase.rpc('compute_viable_city_matrix_cells', {
    cities: CITY_HUBS.map((c) => ({ slug: c.slug, state: c.state, patterns: c.cityMatchPatterns })),
    specialties: SPECIALTY_HUBS.map((s) => ({ slug: s.slug, patterns: s.matchPatterns })),
    min_jobs: MIN_JOBS_PER_CELL,
  })

  if (error) {
    console.error('[city-specialty-matrix] compute_viable_city_matrix_cells RPC failed:', error)
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(`city-specialty-matrix RPC failed: ${error.message}`)
    }
    return []
  }

  const cityBySlug = new Map<string, CityHub>(CITY_HUBS.map((c) => [c.slug, c]))
  const specialtyBySlug = new Map<string, SpecialtyHub>(SPECIALTY_HUBS.map((s) => [s.slug, s]))

  const rows = (data ?? []) as Array<{
    city_slug: string
    specialty_slug: string
    job_count: number
  }>

  return rows
    .map((row) => {
      const city = cityBySlug.get(row.city_slug)
      const specialty = specialtyBySlug.get(row.specialty_slug)
      if (!city || !specialty) return null
      return { city, specialty, count: row.job_count }
    })
    .filter((c): c is CityMatrixCell => c !== null)
}
