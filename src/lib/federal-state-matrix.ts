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
import { unstable_cache } from 'next/cache'
import { supabase as _moduleSupabase } from './supabase'
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
 * piling onto the shared-pool exhaustion. Now wrapped in Next's data cache:
 * ≤ one RPC call per 10min globally, across all instances.
 */
const _cachedViableFederalCells = unstable_cache(
  _computeViableFederalCellsUncached,
  ['viable-federal-matrix-cells-v2'],
  // 6h (was 600s) — recurring federal_jobs_for_match RPC; see specialty-state-matrix
  // note. Less load on the shared MICRO with negligible freshness cost.
  { revalidate: 21600 },
)

export async function getViableFederalCellsCached(
  _supabase?: SupabaseClient,
): Promise<FederalMatrixCell[]> {
  void _supabase // call-site compat; the cached scan uses the shared module client
  return _cachedViableFederalCells()
}

/**
 * The actual scan. Pulls every active federal job once via the
 * `federal_jobs_for_match()` RPC (truncates description to 250 chars
 * server-side so the payload stays under the Next 2MB data-cache cap), runs
 * agency-match in JS, groups by (agency, state). Returns cells with ≥5 jobs in
 * deterministic order. Only ever invoked by `_cachedViableFederalCells`
 * (≤ once / 10 min globally).
 */
async function _computeViableFederalCellsUncached(): Promise<FederalMatrixCell[]> {
  const { data, error } = await _moduleSupabase.rpc('federal_jobs_for_match')
  if (error) {
    console.error('federal_jobs_for_match RPC error:', error)
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
