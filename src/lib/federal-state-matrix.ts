// Computes viable (agency, state) cells for the /jobs/federal/[agency]/[state]
// matrix surface. A cell is "viable" when ≥5 active USAJobs federal jobs match
// the agency's titleKeywords AND share the same state abbreviation.
//
// Mirrors the structure of specialty-state-matrix.ts but scoped to
// source = 'usajobs:federal'. The pre-2026-05-16 federal hub had only the
// 5 agency leaves; this expands to ~50-80 high-signal intersection pages
// (most VA × top state combos qualify; smaller agencies fewer).
//
// The 5-job floor matches the specialty matrix — high enough that the page
// has a meaningful job list, low enough that we don't suppress real demand.

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as _moduleSupabase } from './supabase'
import { getOrComputeCached } from './db-cache'
import { FEDERAL_AGENCIES, type FederalAgency, jobMatchesAgency } from './federal-agencies'
import { STATE_HUBS, type StateHub } from './state-slugs'

export type FederalMatrixCell = {
  agency: FederalAgency
  state: StateHub
  count: number
}

const MIN_JOBS_PER_CELL = 5

/**
 * 🔴 2026-06 INCIDENT FIX (same root cause as specialty-state-matrix). The
 * per-process `_cellCache` did NOT survive cold serverless instances, so every
 * federal-matrix / sitemap render re-ran the `federal_jobs_for_match` RPC →
 * piling onto the shared-pool exhaustion. Now wrapped in a cache: ≤ one RPC
 * call per 6h globally, across all instances.
 *
 * 🔴 2026-08-13 — was `unstable_cache()` until today; replaced with a
 * Postgres-backed cache for the same reason as specialty-state-matrix.ts's
 * sibling comment (confirmed unstable_cache wasn't persisting in production
 * on this OpenNext/Cloudflare deploy). Caches the final JS-computed
 * FederalMatrixCell[] (post agency-matching), not the raw RPC rows -- the
 * agency match logic lives in jobMatchesAgency() here, not in SQL.
 *
 * Cache key/TTL live in FEDERAL_MATRIX_CACHE_KEY/FEDERAL_MATRIX_CACHE_TTL_SECONDS
 * below (6h). See db-cache.ts for the caching contract itself.
 */
const FEDERAL_MATRIX_CACHE_KEY = 'federal_state_matrix'
const FEDERAL_MATRIX_CACHE_TTL_SECONDS = 21600 // 6h, same freshness bar as before

export async function getViableFederalCellsCached(
  _supabase?: SupabaseClient,
): Promise<FederalMatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  const cached = await getOrComputeCached(
    _moduleSupabase,
    FEDERAL_MATRIX_CACHE_KEY,
    FEDERAL_MATRIX_CACHE_TTL_SECONDS,
    _computeViableFederalCellsUncached,
  )
  return rehydrateFederalCells(cached)
}

/**
 * Re-resolve every cached cell against the in-memory hub constants and drop
 * anything that doesn't match. Same contract and same reasoning as
 * specialty-state-matrix.ts's hydrateCells() and city-specialty-matrix.ts's
 * rehydrateCityCells() -- see the latter for the full note.
 *
 * Short version: `set_matrix_cache` is SECURITY DEFINER with EXECUTE granted
 * to `anon`, and it validates only that the value is a JSON array of objects
 * under 1 MiB, never what is inside those objects. Anyone with the publishable
 * anon key can overwrite this row. Its contents feed sitemap.xml URLs
 * (sitemap-chunks.ts builds `/jobs/federal/${c.agency.slug}/${c.state.slug}`
 * straight from it) and generateStaticParams. Re-resolving by slug caps the
 * damage at dropped cells or a wrong count for one TTL window.
 */
function rehydrateFederalCells(rows: unknown): FederalMatrixCell[] {
  if (!Array.isArray(rows)) return []

  const agencyBySlug = new Map<string, FederalAgency>(FEDERAL_AGENCIES.map((a) => [a.slug, a]))
  const stateBySlug = new Map<string, StateHub>(STATE_HUBS.map((s) => [s.slug, s]))

  return rows
    .map((row) => {
      const cell = row as { agency?: { slug?: unknown }; state?: { slug?: unknown }; count?: unknown }
      const agencySlug = cell?.agency?.slug
      const stateSlug = cell?.state?.slug
      if (typeof agencySlug !== 'string' || typeof stateSlug !== 'string') return null
      const agency = agencyBySlug.get(agencySlug)
      const state = stateBySlug.get(stateSlug)
      if (!agency || !state) return null
      const count = typeof cell.count === 'number' && Number.isFinite(cell.count) ? cell.count : 0
      return { agency, state, count }
    })
    .filter((c): c is FederalMatrixCell => c !== null)
}

/**
 * The actual scan. Pulls every active federal job once via the
 * `federal_jobs_for_match()` RPC (truncates description to 250 chars
 * server-side so the payload stays under the Next 2MB data-cache cap), runs
 * agency-match in JS, groups by (agency, state). Returns cells with ≥5 jobs in
 * deterministic order. Only ever invoked by `getViableFederalCellsCached`
 * (≤ once / 6h globally, via the Postgres-backed cache above).
 */
async function _computeViableFederalCellsUncached(): Promise<FederalMatrixCell[]> {
  const { data, error } = await _moduleSupabase.rpc('federal_jobs_for_match')
  if (error) {
    // Same reasoning as specialty-state-matrix.ts: don't let a failure
    // collapse to a cached false-empty result for 6h. Throw at runtime so
    // the failed fetch propagates without poisoning the cache; degrade to
    // empty at BUILD time only, so a DB hiccup during `npm run build`
    // doesn't abort the whole build.
    console.error('[federal-state-matrix] federal_jobs_for_match RPC failed:', error)
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(`federal-state-matrix RPC failed: ${error.message}`)
    }
    return []
  }

  type JobRow = { state: string | null; title: string | null; description: string | null }
  const jobs: JobRow[] = (data ?? []) as JobRow[]

  const byAbbr = new Map<string, StateHub>(STATE_HUBS.map((s) => [s.abbr, s]))
  const counts = new Map<string, FederalMatrixCell>()

  for (const job of jobs) {
    if (!job.state) continue
    const stateHub = byAbbr.get(job.state)
    if (!stateHub) continue
    // A job can attribute to multiple agencies (e.g. a VA hospital's
    // contractor role might match both VA and DoD keywords). Count it
    // toward each matching agency rather than picking one — keeps the
    // hub pages honest: a "DoD jobs in Texas" page that excludes a job
    // mentioning DoD would feel wrong to a searcher.
    for (const agency of FEDERAL_AGENCIES) {
      if (!jobMatchesAgency(job, agency)) continue
      const key = `${agency.slug}|${stateHub.slug}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { agency, state: stateHub, count: 1 })
      }
    }
  }

  return Array.from(counts.values())
    .filter((c) => c.count >= MIN_JOBS_PER_CELL)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (a.agency.slug !== b.agency.slug) {
        return a.agency.slug.localeCompare(b.agency.slug)
      }
      return a.state.slug.localeCompare(b.state.slug)
    })
}

export { MIN_JOBS_PER_CELL }
