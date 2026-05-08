import { describe, expect, it } from 'vitest'
import {
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
  slugify,
  mapToSchemaEmploymentType,
} from './public-jobs'

describe('formatSalary', () => {
  it('returns null when both bounds are missing', () => {
    expect(formatSalary(null, null)).toBe(null)
  })

  it('formats true ranges as $XK–$YK', () => {
    expect(formatSalary(180000, 240000)).toBe('$180K–$240K')
  })

  it('returns single value when min === max', () => {
    expect(formatSalary(150000, 150000)).toBe('$150K')
  })

  it('uses K-shorthand only when amount >= 1000', () => {
    expect(formatSalary(80000, null)).toBe('$80K')
    expect(formatSalary(500, null)).toBe('$500')
  })
})

describe('employmentLabel', () => {
  it('maps each employment-type code to its human label', () => {
    expect(employmentLabel('full_time')).toBe('Full-time')
    expect(employmentLabel('part_time')).toBe('Part-time')
    expect(employmentLabel('contract')).toBe('Contract')
    expect(employmentLabel('locum')).toBe('Locum')
    expect(employmentLabel('per_diem')).toBe('Per diem')
    expect(employmentLabel('internship')).toBe('Internship')
  })

  it('returns null for null/undefined', () => {
    expect(employmentLabel(null)).toBe(null)
  })
})

describe('remoteLabel', () => {
  it('maps each remote-hybrid value to its human label', () => {
    expect(remoteLabel('remote')).toBe('Remote')
    expect(remoteLabel('hybrid')).toBe('Hybrid')
    expect(remoteLabel('onsite')).toBe('Onsite')
  })

  it('returns null for null', () => {
    expect(remoteLabel(null)).toBe(null)
  })
})

describe('locationLabel', () => {
  it('joins city + state with comma', () => {
    expect(locationLabel({ city: 'Tampa', state: 'FL' })).toBe('Tampa, FL')
  })

  it('omits empty parts', () => {
    expect(locationLabel({ city: 'Tampa', state: null })).toBe('Tampa')
    expect(locationLabel({ city: null, state: 'FL' })).toBe('FL')
    expect(locationLabel({ city: null, state: null })).toBe('')
  })
})

describe('slugify', () => {
  it('normalizes title to URL-safe slug', () => {
    expect(slugify('Family Medicine Physician — Tampa, FL')).toBe(
      'family-medicine-physician-tampa-fl'
    )
  })

  it('collapses runs of non-alphanumeric chars to single dash', () => {
    expect(slugify('foo!!!bar???baz')).toBe('foo-bar-baz')
  })

  it('strips leading + trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello')
  })

  it('handles null/undefined gracefully', () => {
    expect(slugify(null)).toBe('')
    expect(slugify(undefined)).toBe('')
    expect(slugify('')).toBe('')
  })

  it('lowercases the output', () => {
    expect(slugify('Cardiology MD')).toBe('cardiology-md')
  })
})

describe('mapToSchemaEmploymentType', () => {
  // These values are the schema.org enum tokens; Google reads them in the
  // JobPosting JSON-LD. If the mapping changes, Google may stop indexing.
  it('maps to the correct schema.org employmentType token', () => {
    expect(mapToSchemaEmploymentType('full_time')).toBe('FULL_TIME')
    expect(mapToSchemaEmploymentType('part_time')).toBe('PART_TIME')
    expect(mapToSchemaEmploymentType('contract')).toBe('CONTRACTOR')
    expect(mapToSchemaEmploymentType('locum')).toBe('TEMPORARY')
    expect(mapToSchemaEmploymentType('per_diem')).toBe('PER_DIEM')
    expect(mapToSchemaEmploymentType('internship')).toBe('INTERN')
  })

  it('defaults to FULL_TIME when type is null', () => {
    expect(mapToSchemaEmploymentType(null)).toBe('FULL_TIME')
  })
})
