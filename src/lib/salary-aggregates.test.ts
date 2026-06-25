import { describe, expect, it } from 'vitest'
import type { PublicJob } from './public-jobs'
import {
  aggregateSalariesByGroup,
  aggregateSalariesOverall,
  fmtUsdCompact,
} from './salary-aggregates'

// Minimal PublicJob fixture. The aggregators only read salary_min/salary_max;
// the grouping key comes from the caller's getGroup, which the tests supply
// directly, so we cast a partial rather than stub every PublicJob field.
function mkJob(
  salary_min: number | null,
  salary_max: number | null,
  extra: Partial<PublicJob> = {},
): PublicJob {
  return { salary_min, salary_max, ...extra } as unknown as PublicJob
}

describe('fmtUsdCompact', () => {
  it.each([
    [500, '$500'],
    [999, '$999'],
    [1_000, '$1K'],
    [84_000, '$84K'],
    [84_400, '$84K'], // rounds down to the nearest $1K
    [999_000, '$999K'],
    [1_000_000, '$1.00M'], // under $10M keeps 2 decimals
    [1_250_000, '$1.25M'],
    [9_900_000, '$9.90M'],
    [12_500_000, '$12.5M'], // $10M and up drops to 1 decimal
  ])('formats %d as %s', (n, expected) => {
    expect(fmtUsdCompact(n)).toBe(expected)
  })
})

describe('aggregateSalariesOverall', () => {
  it('returns null below 3 qualifying rows', () => {
    const jobs = [mkJob(50_000, 70_000), mkJob(60_000, 80_000)]
    expect(aggregateSalariesOverall(jobs)).toBeNull()
  })

  it('computes the 10th/90th-percentile band and the median midpoint over 3 clean rows', () => {
    const jobs = [
      mkJob(50_000, 70_000),
      mkJob(60_000, 80_000),
      mkJob(70_000, 90_000),
    ]
    // mins [50k,60k,70k] -> 10th pct = 52k; maxes [70k,80k,90k] -> 90th pct = 88k;
    // midpoints [60k,70k,80k] -> median = 70k.
    expect(aggregateSalariesOverall(jobs)).toEqual({
      label: 'overall',
      count: 3,
      low: 52_000,
      high: 88_000,
      avg: 70_000,
    })
  })

  it('drops rows missing a salary and rows outside the reasonable band', () => {
    const jobs = [
      mkJob(50_000, 70_000),
      mkJob(60_000, 80_000),
      mkJob(70_000, 90_000),
      mkJob(null, 90_000), // missing min
      mkJob(80_000, null), // missing max
      mkJob(12, 25), // hourly misposted as annual (under $20K)
      mkJob(50_000, 2_000_000), // max above $1M
      mkJob(90_000, 60_000), // max below min (garbage row)
    ]
    // Only the 3 clean rows survive, so the aggregate matches the clean-only case.
    expect(aggregateSalariesOverall(jobs)).toEqual({
      label: 'overall',
      count: 3,
      low: 52_000,
      high: 88_000,
      avg: 70_000,
    })
  })
})

describe('aggregateSalariesByGroup', () => {
  it('buckets by group, drops null groups, and drops groups below minPerGroup', () => {
    const jobs = [
      mkJob(50_000, 70_000, { state: 'FL' }),
      mkJob(60_000, 80_000, { state: 'FL' }),
      mkJob(70_000, 90_000, { state: 'TX' }), // only 1 in TX -> dropped at default min 2
      mkJob(55_000, 75_000, { state: null as unknown as string }), // null group -> excluded
    ]
    const out = aggregateSalariesByGroup(jobs, (j) => j.state ?? null)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ label: 'FL', count: 2 })
  })

  it('honors a custom minPerGroup of 1 and aggregates a single-row group', () => {
    const jobs = [mkJob(70_000, 90_000, { state: 'TX' })]
    const out = aggregateSalariesByGroup(jobs, (j) => j.state ?? null, 1)
    expect(out).toHaveLength(1)
    // n=1: low/high/avg fall back to the single row's values.
    expect(out[0]).toMatchObject({ label: 'TX', count: 1, low: 70_000, high: 90_000, avg: 80_000 })
  })

  it('filters unreasonable rows before grouping', () => {
    const jobs = [
      mkJob(50_000, 70_000, { state: 'FL' }),
      mkJob(60_000, 80_000, { state: 'FL' }),
      mkJob(10, 20, { state: 'FL' }), // unreasonable -> not counted toward FL
    ]
    const out = aggregateSalariesByGroup(jobs, (j) => j.state ?? null)
    expect(out[0]).toMatchObject({ label: 'FL', count: 2 })
  })
})
