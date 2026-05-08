import { describe, expect, it } from 'vitest'
import {
  requiresSalaryDisclosure,
  payTransparencyCitation,
  validatePayTransparency,
} from './pay-transparency'

// These tests lock in the law list. Each state included here has been
// verified to have an active pay-transparency law on the books as of
// 2026-04-30. If a state is removed from the source list (e.g. a law is
// repealed), update the corresponding test rather than silently dropping
// it — the deletion alone can introduce a compliance regression that
// nobody notices until an enforcement letter arrives.

describe('requiresSalaryDisclosure', () => {
  it.each([
    ['CA', true, 'CA SB 1162'],
    ['CO', true, 'CO Equal Pay Act'],
    ['NY', true, 'NY S9427-A'],
    ['WA', true, 'WA SB 5761'],
    ['HI', true, 'HI HB 2657'],
    ['IL', true, 'IL HB 3129'],
    ['MD', true, 'MD HB 649'],
    ['MN', true, 'MN H 4444'],
    ['VT', true, 'VT H 704'],
    ['DC', true, 'DC B25-194'],
  ] as const)('%s requires disclosure with citation %s', (state, expected, citation) => {
    expect(requiresSalaryDisclosure(state)).toBe(expected)
    expect(payTransparencyCitation(state)).toBe(citation)
  })

  it.each([
    ['FL', false], // Florida has no pay-transparency law as of 2026
    ['TX', false],
    ['GA', false],
    ['NC', false],
    ['MA', false],
  ] as const)('%s does not require disclosure', (state, expected) => {
    expect(requiresSalaryDisclosure(state)).toBe(expected)
    expect(payTransparencyCitation(state)).toBe(null)
  })

  it('handles lowercase input', () => {
    expect(requiresSalaryDisclosure('ca')).toBe(true)
    expect(requiresSalaryDisclosure('ny')).toBe(true)
  })

  it('returns false for invalid input', () => {
    expect(requiresSalaryDisclosure(null)).toBe(false)
    expect(requiresSalaryDisclosure(undefined)).toBe(false)
    expect(requiresSalaryDisclosure('')).toBe(false)
    expect(requiresSalaryDisclosure('California')).toBe(false) // Full name not abbr
    expect(requiresSalaryDisclosure('USA')).toBe(false)
    expect(requiresSalaryDisclosure('XX')).toBe(false)
  })
})

describe('validatePayTransparency', () => {
  it('passes through cleanly for non-covered states regardless of salary', () => {
    expect(validatePayTransparency('FL', null, null)).toBe(null)
    expect(validatePayTransparency('TX', 100000, 200000)).toBe(null)
    expect(validatePayTransparency('GA', 50000, null)).toBe(null)
    expect(validatePayTransparency(null, null, null)).toBe(null)
  })

  it('rejects covered states when salary range is missing', () => {
    const err = validatePayTransparency('CA', null, null)
    expect(err).not.toBeNull()
    expect(err).toContain('CA')
    expect(err).toContain('SB 1162')
  })

  it('rejects covered states when only one bound is set', () => {
    expect(validatePayTransparency('NY', 80000, null)).not.toBeNull()
    expect(validatePayTransparency('NY', null, 120000)).not.toBeNull()
  })

  it('rejects zero or negative bounds (sham range)', () => {
    expect(validatePayTransparency('WA', 0, 100000)).not.toBeNull()
    expect(validatePayTransparency('WA', 100000, 0)).not.toBeNull()
    expect(validatePayTransparency('WA', -1, 100000)).not.toBeNull()
  })

  it('rejects inverted ranges', () => {
    const err = validatePayTransparency('CO', 200000, 100000)
    expect(err).not.toBeNull()
    expect(err).toContain('higher than')
  })

  it('passes valid ranges in all 10 covered jurisdictions', () => {
    const states = ['CA', 'CO', 'NY', 'WA', 'HI', 'IL', 'MD', 'MN', 'VT', 'DC']
    for (const s of states) {
      expect(validatePayTransparency(s, 80000, 120000)).toBe(null)
    }
  })

  it('passes equal min/max (a single fixed salary expressed as a "range")', () => {
    expect(validatePayTransparency('CA', 150000, 150000)).toBe(null)
  })

  it('returns user-friendly error text (no internal jargon, includes the citation)', () => {
    const err = validatePayTransparency('CA', null, null)
    expect(err).toMatch(/^[A-Z]{2}/) // Starts with state code
    expect(err).toMatch(/[Aa]dd both/) // Tells user what to do
    expect(err).toContain('SB 1162') // Includes citation for trust
  })
})
