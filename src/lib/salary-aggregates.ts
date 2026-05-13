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
  /** 10th-percentile salary_min — the bottom of the "typical" range. Uses
   *  percentile (not raw min) to ignore data-entry outliers like a
   *  $12K/year listing that's really a $12/hr role misposted as annual. */
  low: number
  /** 90th-percentile salary_max — the top of the "typical" range, robust
   *  to a single $1M outlier listing. */
  high: number
  /** Median of midpoints. Median (not mean) survives a few extreme rows. */
  avg: number
}

/** A reasonable annual-salary band for US healthcare roles. We drop rows
 *  with either field outside this band before aggregating — these are
 *  almost always hourly/weekly listings misposted as annual, or pure
 *  data-entry errors. Healthcare is wide ($30K phlebotomist → $700K
 *  ortho surgeon), but $20K and $1M are defensible outer bounds. */
const REASONABLE_MIN = 20_000
const REASONABLE_MAX = 1_000_000

function isReasonableRange(min: number, max: number): boolean {
  if (min < REASONABLE_MIN || max < REASONABLE_MIN) return false
  if (min > REASONABLE_MAX || max > REASONABLE_MAX) return false
  if (max < min) return false // garbage row
  return true
}

/** Returns the value at the given percentile (0..1) of a sorted-asc array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const idx = (sortedAsc.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  // Linear interpolation between the two flanking values
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
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
    if (!isReasonableRange(j.salary_min, j.salary_max)) continue
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
    const sortedMins = [...b.mins].sort((a, c) => a - c)
    const sortedMaxes = [...b.maxes].sort((a, c) => a - c)
    const sortedMids = [...b.midpoints].sort((a, c) => a - c)
    out.push({
      label,
      count: b.mins.length,
      low: Math.round(percentile(sortedMins, 0.1)),
      high: Math.round(percentile(sortedMaxes, 0.9)),
      avg: Math.round(percentile(sortedMids, 0.5)),
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
    if (!isReasonableRange(j.salary_min, j.salary_max)) continue
    mins.push(j.salary_min)
    maxes.push(j.salary_max)
    midpoints.push((j.salary_min + j.salary_max) / 2)
  }
  if (mins.length < 3) return null // Don't surface aggregates from <3 data points
  const sortedMins = [...mins].sort((a, c) => a - c)
  const sortedMaxes = [...maxes].sort((a, c) => a - c)
  const sortedMids = [...midpoints].sort((a, c) => a - c)
  return {
    label: 'overall',
    count: mins.length,
    low: Math.round(percentile(sortedMins, 0.1)),
    high: Math.round(percentile(sortedMaxes, 0.9)),
    avg: Math.round(percentile(sortedMids, 0.5)),
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
