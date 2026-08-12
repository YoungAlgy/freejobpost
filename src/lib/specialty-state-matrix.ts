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
import { supabase as _moduleSupabase, hourIso } from './supabase'
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { STATE_HUBS, type StateHub } from './state-slugs'
import { activeJobBatchCount, runBatchesConcurrencyCapped } from './active-batch-count'

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
 * The actual scan. Equivalent to one count query per (specialty, state) pair
 * (~900 total) collapsed into a single full-corpus pull + JS-side per-column
 * matching, so the build-time list matches what the runtime `fetchCellJobs`
 * query would render. Returns the cells in deterministic order.
 *
 * Only ever invoked by `_cachedViableCells` (≤ once / 10 min globally).
 */
// 2026-08-07 — firing all `numBatches` (60) range queries at once via a single
// Promise.all was exactly the "hundreds of concurrent 40-batch scans" failure
// mode the incident doc comment above describes, just from one invocation
// instead of many: 60 simultaneous 1000-row reads is still a burst big enough
// to saturate the shared Nano Postgres instance's connection pool and disk-IO
// budget for every app sharing it, confirmed live via pg_stat_statements
// (this exact query was the single largest disk-block-read consumer on the
// shared DB during the 2026-08-06/07 outage). Capping concurrency doesn't
// change what's fetched or how it's cached (still ≤once/6h via
// unstable_cache above) — it only spreads the same 60 reads out instead of
// hitting the DB as one spike. 2026-08-12: moved the cap itself into
// runBatchesConcurrencyCapped (active-batch-count.ts) so every batch-scan
// caller gets it, not just this file — see that file's note.
async function _computeViableCellsUncached(): Promise<MatrixCell[]> {
  const numBatches = await activeJobBatchCount(_moduleSupabase)
  const BATCH_SIZE = 1000
  const nowIso = hourIso()
  const baseQ = () => _moduleSupabase
    .from('public_jobs')
    .select('state, specialty, role, title')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  const batches = await runBatchesConcurrencyCapped(numBatches, (i) =>
    baseQ().range(i * BATCH_SIZE, (i + 1) * BATCH_SIZE - 1)
  )
  const failedBatch = batches.find((b) => b.error)
  if (failedBatch) {
    // Supabase-js returns { data: null, error } on failure instead of
    // throwing, so an unchecked batch silently collapses to `[]` via the
    // `?? []` below — and since this scan is wrapped in a 6h unstable_cache,
    // that fabricated "zero viable cells" result would get cached and feed
    // the sitemap / generateStaticParams / peer-links for up to 6 hours.
    // Throw instead: unstable_cache does not memoize a thrown rejection, so
    // this propagates to the caller for this request while leaving any
    // previously-cached good value in place for subsequent reads.
    console.error(
      '[specialty-state-matrix] batch scan failed, aborting to avoid caching a false-empty result:',
      failedBatch.error,
    )
    // 2026-08-12 — BUILD-TIME ONLY exception. `npm run build` reaches this via
    // /specialty/[slug]/[state]'s generateStaticParams, and throwing there
    // aborts the ENTIRE build, not just this one cache entry — exactly what
    // blocked shipping the 2026-08-07 concurrency fix for days (the fix that
    // reduces DB load couldn't ship until the DB was healthy enough to
    // build). Matches the same NEXT_PHASE guard supabase.ts's
    // assertFreshOrThrow already uses. At build time, degrade to whatever
    // partial data was fetched instead of aborting — every page this feeds
    // has dynamicParams=true, so anything the build misses renders on-demand
    // at runtime against a (by-then hopefully healthy) DB and populates the
    // real cache correctly then. The runtime throw (the actual
    // cache-poisoning protection) is unchanged.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error(`specialty-state-matrix scan failed: ${failedBatch.error!.message}`)
    }
  }
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
