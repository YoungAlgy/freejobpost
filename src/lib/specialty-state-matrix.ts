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
import { activeJobBatchCount } from './active-batch-count'

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
  { revalidate: 600 },
)

export async function getViableCellsCached(
  _supabase?: SupabaseClient,
): Promise<MatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  return _cachedViableCells()
}

/**
 * Builds the viable (specialty, state) cell list from the live job table.
 * Now a thin wrapper over the globally-cached scan (see above) so existing
 * callers (generateStaticParams on /specialty/[slug]/[state], sitemap.ts) no
 * longer trigger a per-render full-corpus scan. The `_supabase` param is kept
 * for call-site compatibility but ignored — the cached scan uses the shared
 * module client.
 */
export async function computeViableCellsViaSql(
  _supabase?: SupabaseClient,
): Promise<MatrixCell[]> {
  void _supabase
  return _cachedViableCells()
}

/**
 * The actual scan. Equivalent to one count query per (specialty, state) pair
 * (~900 total) collapsed into a single full-corpus pull + JS-side per-column
 * matching, so the build-time list matches what the runtime `fetchCellJobs`
 * query would render. Returns the cells in deterministic order.
 *
 * Only ever invoked by `_cachedViableCells` (≤ once / 10 min globally).
 */
async function _computeViableCellsUncached(): Promise<MatrixCell[]> {
  const numBatches = await activeJobBatchCount(_moduleSupabase)
  const BATCH_SIZE = 1000
  const nowIso = new Date().toISOString()
  const baseQ = () => _moduleSupabase
    .from('public_jobs')
    .select('state, specialty, role, title')
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
    state: string | null
    specialty: string | null
    role: string | null
    title: string | null
  }>

  const byAbbr = new Map<string, StateHub>(STATE_HUBS.map((s) => [s.abbr, s]))
  const counts = new Map<string, { specialty: SpecialtyHub; state: StateHub; count: number }>()

  function fieldMatches(value: string | null, patterns: readonly string[]): boolean {
    if (!value) return false
    const lower = value.toLowerCase()
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) return true
    }
    return false
  }

  for (const job of jobs) {
    if (!job.state) continue
    const stateHub = byAbbr.get(job.state)
    if (!stateHub) continue
    for (const specialty of SPECIALTY_HUBS) {
      if (
        !fieldMatches(job.specialty, specialty.matchPatterns) &&
        !fieldMatches(job.role, specialty.matchPatterns) &&
        !fieldMatches(job.title, specialty.matchPatterns)
      ) {
        continue
      }
      const key = `${specialty.slug}|${stateHub.slug}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { specialty, state: stateHub, count: 1 })
      }
    }
  }

  return Array.from(counts.values())
    .filter((c) => c.count >= MIN_JOBS_PER_CELL)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (a.specialty.slug !== b.specialty.slug) {
        return a.specialty.slug.localeCompare(b.specialty.slug)
      }
      return a.state.slug.localeCompare(b.state.slug)
    })
}
