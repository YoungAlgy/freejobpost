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
import { supabase as _moduleSupabase } from './supabase'
import { getOrComputeCached } from './db-cache'
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
 * Fix: wrap the scan in a cache so it runs at most once per 6h GLOBALLY —
 * shared across every serverless instance — no matter how many pages render.
 * ALL callers (matrix peer-links via getViableCellsCached, sitemap, and
 * generateStaticParams via computeViableCellsViaSql) now route through this
 * single cached entry, so the corpus is scanned ~once/6h total instead of
 * once per render.
 *
 * 🔴 2026-08-13 — this was `unstable_cache()` (Next's Data Cache) until today.
 * Confirmed live that it was a complete no-op in production on this OpenNext/
 * Cloudflare deploy: the underlying RPC (compute_viable_matrix_cells) ran
 * 25,799 times in a few hours (8.3M ms cumulative) despite the 6h wrapper —
 * the single most expensive query on the shared database. Its D1 tag-cache
 * had zero entries for this key even though OTHER tag writes (revalidatePath)
 * were landing fine, so the failure is specific to unstable_cache, not D1/R2
 * access generally. Replaced with a Postgres-backed cache (see db-cache.ts)
 * instead of chasing the exact Next/OpenNext internals further.
 */
const MATRIX_CACHE_KEY = 'specialty_state_matrix'
const MATRIX_CACHE_TTL_SECONDS = 21600 // 6h, same freshness bar as before

/**
 * The cached shape: exactly what the RPC returns (slugs + count), NOT the
 * hydrated MatrixCell (which embeds the whole SpecialtyHub and StateHub).
 *
 * 🔴 2026-08-19 INCIDENT FIX — this cache had been failing to write for days.
 * Production logs showed, on essentially every render:
 *   [db-cache] set_matrix_cache(specialty_state_matrix) failed:
 *   set_matrix_cache: value too large for key specialty_state_matrix
 * set_matrix_cache rejects anything over 1 MiB. The value being written was the
 * hydrated MatrixCell[]: each cell inlines the full SpecialtyHub (title +
 * metaDescription + shortDescription + matchPatterns) and the full StateHub,
 * ~1,468 bytes per cell. At 800 viable cells that is ~1.12 MB — just over the
 * limit, crossed silently as inventory grew (the cap binds at ~714 cells).
 *
 * Consequences, all of which were live: the cache row sat frozen at a 5-byte
 * `[]` written 2026-08-14 and never refreshed, `get_matrix_cache` returned NULL
 * (stale past its 6h window) on every call, and so the RPC — a ~49K-row scan
 * ILIKE-matched against 33 specialties × 3 columns — re-ran on EVERY caller:
 * every /specialty/[slug] render, every /specialty/[slug]/[state] render, and
 * every sitemap.xml render. /specialty/registered-nurse was timing out (524)
 * and /sitemap.xml was 503ing as a direct result.
 *
 * Caching the RPC rows instead drops the payload to ~80 bytes/cell (~62 KB at
 * 800 cells, 16x under the limit) and costs nothing: the hubs are in-memory
 * constants, so hydration is a Map lookup that the old code was already doing.
 * It also cuts the JSON the Worker has to parse per render by ~18x, which
 * matters on a runtime that is currently CPU-bound.
 */
type MatrixCellRow = {
  specialty_slug: string
  state_slug: string
  job_count: number
}

export async function getViableCellsCached(
  _supabase?: SupabaseClient,
): Promise<MatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  const rows = await getOrComputeCached(
    _moduleSupabase,
    MATRIX_CACHE_KEY,
    MATRIX_CACHE_TTL_SECONDS,
    _computeViableCellRowsUncached,
  )
  return hydrateCells(rows)
}

/**
 * Slugs → hub objects. Rows whose slug no longer matches a configured hub are
 * dropped, which is what makes a cached payload safe to serve across a deploy
 * that removes or renames a specialty/state hub.
 */
function hydrateCells(rows: MatrixCellRow[]): MatrixCell[] {
  // Array-check, not just a null-check: this value round-trips through jsonb,
  // so a legacy/corrupt cache row could be any JSON shape. Treat anything that
  // isn't an array as a miss rather than throwing inside a page render.
  if (!Array.isArray(rows)) return []

  const bySlug = new Map<string, SpecialtyHub>(SPECIALTY_HUBS.map((s) => [s.slug, s]))
  const stateBySlug = new Map<string, StateHub>(STATE_HUBS.map((s) => [s.slug, s]))

  return rows
    .map((row) => {
      const specialty = bySlug.get(row.specialty_slug)
      const state = stateBySlug.get(row.state_slug)
      if (!specialty || !state) return null
      return { specialty, state, count: row.job_count }
    })
    .filter((c): c is MatrixCell => c !== null)
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
 * Only ever invoked by `getViableCellsCached` (≤ once / 6h globally, via
 * the Postgres-backed cache above).
 */
async function _computeViableCellRowsUncached(): Promise<MatrixCellRow[]> {
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

  // Returned (and cached) as-is — hydration into MatrixCell happens after the
  // cache layer, in hydrateCells(). See the MatrixCellRow note above for why.
  return (data ?? []) as MatrixCellRow[]
}
