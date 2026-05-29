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
import { SPECIALTY_HUBS, type SpecialtyHub } from './specialty-slugs'
import { STATE_HUBS, type StateHub } from './state-slugs'

export type MatrixCell = {
  specialty: SpecialtyHub
  state: StateHub
  count: number
}

type JobRow = {
  state: string | null
  specialty: string | null
  role: string | null
  title: string | null
}

const MIN_JOBS_PER_CELL = 5

function specialtyMatches(job: JobRow, patterns: readonly string[]): boolean {
  const haystack = [
    job.specialty?.toLowerCase() ?? '',
    job.role?.toLowerCase() ?? '',
    job.title?.toLowerCase() ?? '',
  ].join(' | ')
  for (const p of patterns) {
    if (haystack.includes(p.toLowerCase())) return true
  }
  return false
}

/**
 * From the full active-job list, returns every (specialty, state) cell
 * that has at least MIN_JOBS_PER_CELL matching jobs. Order: descending
 * by count, then specialty slug, then state slug.
 */
export function computeViableCells(jobs: JobRow[]): MatrixCell[] {
  const byAbbr = new Map<string, StateHub>(
    STATE_HUBS.map((s) => [s.abbr, s])
  )
  const counts = new Map<string, MatrixCell>()

  for (const job of jobs) {
    const stateHub = job.state ? byAbbr.get(job.state) : null
    if (!stateHub) continue
    for (const specialty of SPECIALTY_HUBS) {
      if (!specialtyMatches(job, specialty.matchPatterns)) continue
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

export { MIN_JOBS_PER_CELL }

/**
 * Process-scoped memoization of `computeViableCellsViaSql`. Without it,
 * every /state/[slug] and /specialty/[slug] page (~80 routes) re-issues
 * the same 5K-row Supabase query on ISR revalidate.
 *
 * The cache key is just "all" because the underlying query has no
 * parameters. TTL of 10 min matches the page revalidate windows so
 * stale data stays in step with the rest of the surface.
 */
let _cellCache: { at: number; value: MatrixCell[] } | null = null
const CELL_CACHE_TTL_MS = 10 * 60 * 1000

export async function getViableCellsCached(
  supabase: SupabaseClient,
): Promise<MatrixCell[]> {
  const now = Date.now()
  if (_cellCache && now - _cellCache.at < CELL_CACHE_TTL_MS) {
    return _cellCache.value
  }
  const value = await computeViableCellsViaSql(supabase)
  _cellCache = { at: now, value }
  return value
}

/**
 * The SQL-counted version of computeViableCells. Issues one count query
 * per (specialty, state) pair (~900 total) using the SAME `.or()` filter
 * the runtime page uses, so the build-time list matches what's actually
 * renderable. Returns the cells in deterministic order.
 *
 * Used by both `generateStaticParams` on /specialty/[slug]/[state] and
 * by `sitemap.ts` so the sitemap, the prerendered routes, and the
 * runtime renderable URLs all stay in lockstep.
 */
export async function computeViableCellsViaSql(
  supabase: SupabaseClient,
): Promise<{ specialty: SpecialtyHub; state: StateHub; count: number }[]> {
  // Single big SQL pull, JS-side per-column matching. This is structurally
  // equivalent to the SQL `or=(specialty.ilike.*p*, ...)` approach but
  // collapses 900 round-trips into one. ~425 active rows fit easily in one
  // response.
  //
  // The earlier (broken) JS version concatenated specialty + role + title
  // into a single haystack with " | " — that LET a pattern straddle field
  // boundaries (e.g. "rn " could match the literal " | " separator
  // adjacent to a non-RN role). This version checks each field separately,
  // which is exactly what SQL ILIKE does, so cell counts match the runtime
  // `fetchCellJobs` query.
  // 12-batch range — PostgREST silently caps `.limit(>1000)` for anon role,
  // so the prior `.limit(5000)` was returning 1,000 rows. With ~9,616 active
  // jobs that's 88% under-coverage, and the matrix-cell counts that drive
  // /specialty/[specialty]/[state] page generation were silently truncated.
  // Bumped from 9 → 12 on 2026-05-21 to match /jobs.xml + feed-builders +
  // /sitemap.ts; one canonical batch count across every full-inventory
  // fetch in the codebase prevents the matrix from drifting out of sync
  // with feeds as inventory grows past 9k.
  // 2026-05-28 audit: 12→30. The 12K ceiling under-counted specialty×state cells
  // at 14.6K active inventory (some viable cells missed). Bump (or switch to
  // count-based paging) before 30K.
  const NUM_BATCHES = 30
  const BATCH_SIZE = 1000
  const nowIso = new Date().toISOString()
  const baseQ = () => supabase
    .from('public_jobs')
    .select('state, specialty, role, title')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
  const batches = await Promise.all(
    Array.from({ length: NUM_BATCHES }, (_, i) =>
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
