// Computes viable (city, specialty) cells for the /city/[slug]/[specialty]
// matrix surface. A cell is viable when ≥MIN_JOBS_PER_CELL active jobs match
// the specialty's matchPatterns AND match the city's cityMatchPatterns
// within the same state.
//
// Mirrors specialty-state-matrix.ts in structure. The two matrices live
// in separate files because the city dimension uses substring matching
// (NYC's borough variants) while the state dimension is an exact-abbr
// match — keeping the lookup logic separate avoids overgeneralizing one
// at the expense of the other.

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as _moduleSupabase } from './supabase'
import { getOrComputeCached } from './db-cache'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { CITY_HUBS, type CityHub } from './city-slugs'

export type CityMatrixCell = {
  city: CityHub
  specialty: SpecialtyHub
  count: number
}

// 🔴 2026-08-21 — raised 5 → 25. This intersection surface (city×specialty,
// up to ~700 theoretical combos) is one of the three matrix families that
// has repeatedly driven this shared DB's CPU/disk-IO exhaustion (see
// hub-job-queries.ts's incident comment). With real freejobpost usage near
// zero (confirmed same-day: near-zero organic search/browse activity), the
// long tail of barely-qualifying 5-job cells isn't earning its recurring
// compute cost. A much higher floor cuts the page/cache-population count
// substantially while keeping the cells with real content. Purely a
// generation-threshold change — no listings are touched or removed.
const MIN_JOBS_PER_CELL = 25

export { MIN_JOBS_PER_CELL }

/**
 * 🔴 2026-06 INCIDENT FIX (same root cause as specialty-state-matrix). The
 * per-process `_cellCache` did NOT survive cold serverless instances, so every
 * city-matrix / sitemap render re-ran the full 40-batch corpus scan → shared
 * pool exhaustion. Now wrapped in a cache: ≤ one scan per 6h globally, across
 * all instances.
 *
 * 🔴 2026-08-13 — was `unstable_cache()` until today; replaced with a
 * Postgres-backed cache for the same reason as specialty-state-matrix.ts's
 * sibling comment (confirmed unstable_cache wasn't persisting in production
 * on this OpenNext/Cloudflare deploy).
 */
const CITY_MATRIX_CACHE_KEY = 'city_specialty_matrix'
const CITY_MATRIX_CACHE_TTL_SECONDS = 21600 // 6h, same freshness bar as before

export async function getViableCityCellsCached(
  _supabase?: SupabaseClient,
): Promise<CityMatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  const cached = await getOrComputeCached(
    _moduleSupabase,
    CITY_MATRIX_CACHE_KEY,
    CITY_MATRIX_CACHE_TTL_SECONDS,
    _computeViableCityCellsUncached,
  )
  return rehydrateCityCells(cached)
}

/**
 * Re-resolve every cached cell against the in-memory hub constants and drop
 * anything that doesn't match. Same contract as specialty-state-matrix.ts's
 * hydrateCells(), and it exists for the same two reasons plus one more:
 *
 *  1. A cached payload written before a deploy that renamed or removed a
 *     city/specialty hub stays safe to serve.
 *  2. The value round-trips through jsonb, so a legacy or corrupt row can be
 *     any JSON shape. Treat anything unexpected as a miss rather than
 *     throwing inside a page render.
 *  3. The cache row is anon-writable. `set_matrix_cache` is a SECURITY
 *     DEFINER function with EXECUTE granted to `anon` (it has to be: the
 *     server renders with the public anon key), and it only checks that the
 *     value is a JSON array of objects under 1 MiB. It does NOT check what
 *     is in those objects. So anyone holding the publishable anon key can
 *     overwrite this row with arbitrary {city, specialty, count} objects.
 *     Those flow straight into sitemap.xml URLs and generateStaticParams.
 *     Re-resolving by slug here means an attacker can at worst drop cells or
 *     lie about a count for one TTL window, never inject a slug or a URL.
 *     The specialty matrix already had this guard. City and federal did not.
 */
function rehydrateCityCells(rows: unknown): CityMatrixCell[] {
  if (!Array.isArray(rows)) return []

  const cityBySlug = new Map<string, CityHub>(CITY_HUBS.map((c) => [c.slug, c]))
  const specialtyBySlug = new Map<string, SpecialtyHub>(SPECIALTY_HUBS.map((s) => [s.slug, s]))

  return rows
    .map((row) => {
      const cell = row as { city?: { slug?: unknown }; specialty?: { slug?: unknown }; count?: unknown }
      const citySlug = cell?.city?.slug
      const specialtySlug = cell?.specialty?.slug
      if (typeof citySlug !== 'string' || typeof specialtySlug !== 'string') return null
      const city = cityBySlug.get(citySlug)
      const specialty = specialtyBySlug.get(specialtySlug)
      if (!city || !specialty) return null
      const count = typeof cell.count === 'number' && Number.isFinite(cell.count) ? cell.count : 0
      return { city, specialty, count }
    })
    .filter((c): c is CityMatrixCell => c !== null)
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
