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
