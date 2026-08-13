// Computes viable (specialty, state) cells for the /specialty/[slug]/[state]
// matrix-page surface. A cell is "viable" when ≥5 active jobs match the
// specialty's matchPatterns AND share the same state abbreviation.
//
// Why ≥5 not ≥3? The thin-content threshold for a templated long-tail
// surface needs a higher floor than for an individual hub page — these
// are intersection pages, so the underlying signal needs to be strong
// enough that the page isn't competing with its own parent hubs on
// the same query. Five jobs is the minimum where a per-cell salary
// aggregate is meaningful AND a job list has enough variety to be
// useful in its own right.

import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { supabase as _moduleSupabase } from './supabase'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { STATE_HUBS, type StateHub } from './state-slugs'

export type MatrixCell = {
  specialty: SpecialtyHub
  state: StateHub
  count: number
}

const MIN_JOBS_PER_CELL = 5

export { MIN_JOBS_PER_CELL }

/**
 * 🔴 2026-06 INCIDENT FIX (CRM-wide pool exhaustion).
 *
 * The viable-cells scan reads the ENTIRE active corpus in ~40 `.range()`
 * batches. It was only memoized PER PROCESS (a module-level `_cellCache`), so on
 * Vercel — where each cold serverless invocation is a fresh process — every
 * matrix peer-links render, sitemap render, and generateStaticParams re-ran the
 * full 40-batch scan. Under crawler-driven ISR revalidation across hundreds of
 * stale matrix pages × cold instances, that became hundreds of concurrent
 * 40-batch scans → PostgREST connection-pool exhaustion that wedged the entire
 * SHARED database (CRM + providers + every app) for days, with thousands of
 * `522`s in the API logs.
 *
 * Fix: wrap the scan in Next's **data cache** (`unstable_cache`) so it runs at
 * most once per 10 minutes GLOBALLY — shared across every serverless instance —
 * no matter how many pages render. ALL callers (matrix peer-links via
 * getViableCellsCached, sitemap, and generateStaticParams via
 * computeViableCellsViaSql) now route through this single cached entry, so the
 * corpus is scanned ~once/10min total instead of once per render.
 */
const _cachedViableCells = unstable_cache(
  _computeViableCellsUncached,
  ['viable-matrix-cells-v2'],
  // 6h (was 600s). The viable-cell list changes very slowly, but 600s meant a
  // ~40-batch full-corpus scan up to 144×/day — and with 3 such matrices that's
  // ~430 full scans/day hammering the SHARED MICRO (same pool-exhaustion class as
  // the 2026-06 incident above). 6h cuts that ~36× with negligible freshness cost.
  { revalidate: 21600 },
)

export async function getViableCellsCached(
  _supabase?: SupabaseClient,
): Promise<MatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  return _cachedViableCells()
}

/**
 * Alias kept for call-site compatibility (generateStaticParams on
 * /specialty/[slug]/[state], sitemap.ts). Identical behavior to
 * `getViableCellsCached` — see that function's doc comment above.
 */
export { getViableCellsCached as computeViableCellsViaSql }

/**
 * The actual scan. Delegates the (specialty, state) grouping + pattern match
 * to a single Postgres RPC (`compute_viable_matrix_cells`, migration
 * 20260813) instead of pulling the whole active-job corpus into JS and
 * matching it here.
 *
 * 🔴 2026-08-13 — WHY THIS CHANGED. The batch-scan version below (kept in
 * git history) was already wrapped in a 6h `unstable_cache` (see above), but
 * a live incident audit that night found the OpenNext R2/D1-backed cache was
 * being missed on nearly every request in production — this one query ran
 * 10,000+ times in a 35-minute window per `pg_stat_statements`, ~30x more
 * than every other query on the shared DB combined, and was the direct
 * cause of the CPU/disk-IO exhaustion that forced that same night's
 * Supabase compute upgrade. The exact cache-miss trigger wasn't fully
 * pinned (would need live debug-log tracing to confirm), but it doesn't
 * matter: a cache miss on a cheap indexed SQL aggregate is fine regardless.
 * This removes the correctness of this endpoint's cost from depending on
 * the app-level cache being reliable at all — even an uncached call here is
 * one query, not 60 batched reads of ~20K rows.
 *
 * Only ever invoked by `_cachedViableCells` (≤ once / 6h globally, same
 * unstable_cache wrapper as before — kept as a second layer, not load-bearing).
 */
async function _computeViableCellsUncached(): Promise<MatrixCell[]> {
  const { data, error } = await _moduleSupabase.rpc('compute_viable_matrix_cells', {
    specialties: SPECIALTY_HUBS.map((s) => ({ slug: s.slug, patterns: s.matchPatterns })),
    states: STATE_HUBS.map((s) => ({ slug: s.slug, abbr: s.abbr })),
    min_jobs: MIN_JOBS_PER_CELL,
  })

  if (error) {
    // Same reasoning as the old batch-scan version: don't let a failure
    // collapse to a cached false-empty result. Throw at runtime so the
    // failed fetch propagates without poisoning the 6h cache; degrade to
    // empty at BUILD time only, so a DB hiccup during `npm run build`
    // doesn't abort the whole build (every page this feeds has
    // dynamicParams=true and renders on-demand at runtime instead).
    console.error('[specialty-state-matrix] compute_viable_matrix_cells RPC failed:', error)
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(`specialty-state-matrix RPC failed: ${error.message}`)
    }
    return []
  }

  const bySlug = new Map<string, SpecialtyHub>(SPECIALTY_HUBS.map((s) => [s.slug, s]))
  const stateBySlug = new Map<string, StateHub>(STATE_HUBS.map((s) => [s.slug, s]))

  const rows = (data ?? []) as Array<{
    specialty_slug: string
    state_slug: string
    job_count: number
  }>

  return rows
    .map((row) => {
      const specialty = bySlug.get(row.specialty_slug)
      const state = stateBySlug.get(row.state_slug)
      if (!specialty || !state) return null
      return { specialty, state, count: row.job_count }
    })
    .filter((c): c is MatrixCell => c !== null)
}
