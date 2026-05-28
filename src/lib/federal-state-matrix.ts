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
import { FEDERAL_AGENCIES, type FederalAgency, jobMatchesAgency } from './federal-agencies'
import { STATE_HUBS, type StateHub } from './state-slugs'

export type FederalMatrixCell = {
  agency: FederalAgency
  state: StateHub
  count: number
}

const MIN_JOBS_PER_CELL = 5

/**
 * Pull every active federal job once, run agency-match in JS, group by
 * (agency, state). Returns cells with ≥5 jobs in deterministic order.
 *
 * 2026-05-27: switched from a raw `select state,title,description` (which
 * had grown to 6.4MB — over the Next.js 2MB data-cache cap, forcing a
 * re-fetch on every page and spiking SSG build time enough to time out
 * /jobs/federal builds) to the `federal_jobs_for_match()` RPC which
 * truncates description to 250 chars server-side. The agency keyword
 * lands in the first sentence of every USAJobs body, so the truncated
 * text preserves the JS-side match signal while dropping the payload to
 * ~950KB — back under the cache cap.
 *
 * Used by:
 *   - generateStaticParams on /jobs/federal/[agency]/[state]
 *   - sitemap.ts to enumerate the federal-matrix URLs
 *   - the runtime page renderer (to seed the count badge before fetching
 *     the actual listing slice)
 */
export async function computeViableFederalCells(
  supabase: SupabaseClient,
): Promise<FederalMatrixCell[]> {
  const { data, error } = await supabase.rpc('federal_jobs_for_match')
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

/**
 * Process-scoped memoization mirroring getViableCellsCached for the
 * specialty matrix. The sitemap + every /jobs/federal/[agency]/[state]
 * page hits this; the underlying query is parameter-free, so a single
 * cache slot is enough.
 */
let _cellCache: { at: number; value: FederalMatrixCell[] } | null = null
const CELL_CACHE_TTL_MS = 10 * 60 * 1000

export async function getViableFederalCellsCached(
  supabase: SupabaseClient,
): Promise<FederalMatrixCell[]> {
  const now = Date.now()
  if (_cellCache && now - _cellCache.at < CELL_CACHE_TTL_MS) {
    return _cellCache.value
  }
  const value = await computeViableFederalCells(supabase)
  _cellCache = { at: now, value }
  return value
}

export { MIN_JOBS_PER_CELL }
