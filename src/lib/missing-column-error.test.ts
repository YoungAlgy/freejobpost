import { describe, expect, it } from 'vitest'
import { isMissingColumnError } from './missing-column-error'

describe('isMissingColumnError', () => {
  it.each([
    ['42703', 'column public_jobs.syndication_targets does not exist'],
    ['42703', 'column "syndication_targets" does not exist'],
    ['42703', 'column syndication_targets does not exist'],
    ['PGRST204', "Could not find the 'syndication_targets' column of 'public_jobs' in the schema cache"],
  ])('accepts a specifically identified legacy column: %s %s', (code, message) => {
    expect(isMissingColumnError({ code, message }, 'public_jobs', 'syndication_targets')).toBe(true)
  })

  it.each([
    ['42703', 'column public_jobs.company_name does not exist'],
    ['PGRST204', "Could not find the 'company_name' column of 'public_jobs' in the schema cache"],
    ['PGRST204', "Could not find the 'syndication_targets' column of 'other_table' in the schema cache"],
    ['42501', 'permission denied for table public_jobs'],
    ['', 'TypeError: fetch failed'],
    ['PGRST000', 'database connection timed out'],
    ['522', 'upstream connection timed out'],
    ['', 'column public_jobs.syndication_targets does not exist'],
  ])('rejects unrelated failures: %s %s', (code, message) => {
    expect(isMissingColumnError({ code, message }, 'public_jobs', 'syndication_targets')).toBe(false)
  })
})
