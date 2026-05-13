// Plain-HTML salary aggregates for state + specialty hubs.
//
// Why plain HTML and not Schema.org? Google deprecated Occupation /
// EstimatedSalary structured data in Sept 2025 (Search Console reporting
// removed, API support ended Dec 2025). The 2025/2026 SEO play for salary
// queries is AI Overview citability — clear h2 matching the query, plain
// data tables. See `memory/feedback_seo_dead_schemas.md` for the locked
// rule + sources.
//
// Why aggregate at render time? The data lives in `public_jobs` and changes
// every revalidate cycle. Building from already-fetched job rows costs ~0
// (no extra Supabase query) and stays honest with actual inventory.

import type { PublicJob } from './public-jobs'

export type SalaryAggregate = {
  /** Display label for this group (e.g. "Registered Nurse" or "Florida") */
  label: string
  /** Number of jobs in this group with both salary_min and salary_max */
  count: number
  /** Min salary_min across the group (the floor of the range) */
  low: number
  /** Max salary_max across the group (the ceiling of the range) */
  high: number
  /** Average of (salary_min + salary_max) / 2 — the midpoint distribution */
  avg: number
}

/**
 * Aggregate salaried jobs by a grouping function. Skips jobs missing either
 * salary_min or salary_max — the resulting numbers are honest because every
 * job in the aggregate has a real published range.
 *
 * @param jobs The job list (already filtered by state/specialty/etc.)
 * @param getGroup Function returning the group key for a job, or null to
 *                 exclude the job entirely.
 * @param minPerGroup Drop groups with fewer than this many qualifying jobs.
 *                    Default 2 — a single-job "range" doesn't aggregate.
 */
export function aggregateSalariesByGroup(
  jobs: PublicJob[],
  getGroup: (job: PublicJob) => string | null,
  minPerGroup = 2
): SalaryAggregate[] {
  const buckets = new Map<string, { mins: number[]; maxes: number[]; midpoints: number[] }>()
  for (const j of jobs) {
    if (j.salary_min == null || j.salary_max == null) continue
    const group = getGroup(j)
    if (!group) continue
    if (!buckets.has(group)) {
      buckets.set(group, { mins: [], maxes: [], midpoints: [] })
    }
    const b = buckets.get(group)!
    b.mins.push(j.salary_min)
    b.maxes.push(j.salary_max)
    b.midpoints.push((j.salary_min + j.salary_max) / 2)
  }

  const out: SalaryAggregate[] = []
  for (const [label, b] of buckets.entries()) {
    if (b.mins.length < minPerGroup) continue
    out.push({
      label,
      count: b.mins.length,
      low: Math.min(...b.mins),
      high: Math.max(...b.maxes),
      avg: Math.round(b.midpoints.reduce((a, c) => a + c, 0) / b.midpoints.length),
    })
  }
  return out
}

/**
 * Returns the overall aggregate across all jobs (ignores grouping).
 * Useful for the lede paragraph above the per-group table.
 */
export function aggregateSalariesOverall(jobs: PublicJob[]): SalaryAggregate | null {
  const mins: number[] = []
  const maxes: number[] = []
  const midpoints: number[] = []
  for (const j of jobs) {
    if (j.salary_min == null || j.salary_max == null) continue
    mins.push(j.salary_min)
    maxes.push(j.salary_max)
    midpoints.push((j.salary_min + j.salary_max) / 2)
  }
  if (mins.length < 3) return null // Don't surface aggregates from <3 data points
  return {
    label: 'overall',
    count: mins.length,
    low: Math.min(...mins),
    high: Math.max(...maxes),
    avg: Math.round(midpoints.reduce((a, c) => a + c, 0) / midpoints.length),
  }
}

/** Compact USD formatter — $84,000 → "$84K", $1,250,000 → "$1.25M". */
export function fmtUsdCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `$${m.toFixed(m < 10 ? 2 : 1)}M`
  }
  if (n >= 1_000) {
    return `$${Math.round(n / 1_000)}K`
  }
  return `$${n}`
}
