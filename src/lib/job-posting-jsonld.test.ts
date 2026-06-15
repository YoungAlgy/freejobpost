import { describe, expect, it } from 'vitest'
import {
  buildJobPostingJsonLd,
  validateJobPostingJsonLd,
  type EmployerSummary,
} from './job-posting-jsonld'
import type { PublicJob } from './public-jobs'

const baseJob: PublicJob = {
  id: 'job-1',
  slug: 'cardiology-md-tampa',
  title: 'Cardiologist',
  description: 'Cardiology role at Tampa General. Full-time, day shift, 36 hours/wk.',
  role: 'Cardiologist',
  specialty: 'Cardiology',
  vertical: 'healthcare',
  city: 'Tampa',
  state: 'FL',
  remote_hybrid: 'onsite',
  employment_type: 'full_time',
  salary_min: 350000,
  salary_max: 500000,
  experience_required: '3 years',
  apply_url: 'https://example.com/apply',
  source: 'seeded',
  created_at: '2026-05-20T12:00:00.000Z',
  expires_at: '2026-07-19T12:00:00.000Z',
  employer_id: 'emp-1',
}

const baseEmployer: EmployerSummary = {
  name: 'Tampa General Hospital',
  isSeeded: false,
  slug: 'tampa-general-hospital',
}

describe('buildJobPostingJsonLd — onsite role', () => {
  const out = buildJobPostingJsonLd({ job: baseJob, employer: baseEmployer })

  it('sets @context + @type per Google spec', () => {
    expect(out['@context']).toBe('https://schema.org')
    expect(out['@type']).toBe('JobPosting')
  })

  it('emits the 5 Google-required fields (title, description, datePosted, hiringOrganization, jobLocation)', () => {
    expect(out.title).toBe('Cardiologist')
    expect(out.description).toBe(baseJob.description)
    expect(out.datePosted).toBe('2026-05-20')
    expect(out.hiringOrganization).toMatchObject({
      '@type': 'Organization',
      name: 'Tampa General Hospital',
      sameAs: 'https://freejobpost.co/employers/tampa-general-hospital',
    })
    expect(out.jobLocation).toMatchObject({
      '@type': 'Place',
      address: expect.objectContaining({
        '@type': 'PostalAddress',
        addressLocality: 'Tampa',
        addressRegion: 'FL',
        addressCountry: 'US',
      }),
    })
  })

  it('does NOT emit jobLocationType or applicantLocationRequirements on onsite', () => {
    expect(out.jobLocationType).toBeUndefined()
    expect(out.applicantLocationRequirements).toBeUndefined()
  })

  it('includes baseSalary when salary_min/max are set', () => {
    expect(out.baseSalary).toMatchObject({
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: expect.objectContaining({
        '@type': 'QuantitativeValue',
        minValue: 350000,
        maxValue: 500000,
        unitText: 'YEAR',
      }),
    })
  })

  it('parses leading-numeric experience_required to monthsOfExperience', () => {
    expect(out.experienceRequirements).toMatchObject({
      '@type': 'OccupationalExperienceRequirements',
      monthsOfExperience: 36, // 3 years × 12
    })
  })

  it('passes validateJobPostingJsonLd with zero errors', () => {
    expect(validateJobPostingJsonLd(out)).toEqual([])
  })
})

describe('buildJobPostingJsonLd — remote role', () => {
  const remoteJob: PublicJob = { ...baseJob, remote_hybrid: 'remote', city: null }
  const out = buildJobPostingJsonLd({ job: remoteJob, employer: baseEmployer })

  it('emits jobLocationType:TELECOMMUTE + applicantLocationRequirements (Google remote-job spec)', () => {
    expect(out.jobLocationType).toBe('TELECOMMUTE')
    expect(out.applicantLocationRequirements).toMatchObject({
      '@type': 'Country',
      name: 'USA',
    })
  })

  it('does NOT emit jobLocation on remote (content-mismatch protection)', () => {
    expect(out.jobLocation).toBeUndefined()
  })

  it('passes validateJobPostingJsonLd with zero errors', () => {
    expect(validateJobPostingJsonLd(out)).toEqual([])
  })
})

describe('buildJobPostingJsonLd — seeded Ava role', () => {
  const out = buildJobPostingJsonLd({
    job: baseJob,
    employer: { name: 'Ava Health Partners', isSeeded: true, slug: null },
  })

  it('uses avahealth.co sameAs + logo for seeded employers (not a per-employer page)', () => {
    expect(out.hiringOrganization).toMatchObject({
      '@type': 'Organization',
      name: 'Ava Health Partners',
      sameAs: 'https://avahealth.co',
      logo: 'https://avahealth.co/logo.png',
    })
  })

  it('passes validateJobPostingJsonLd with zero errors', () => {
    expect(validateJobPostingJsonLd(out)).toEqual([])
  })
})

describe('buildJobPostingJsonLd — ATS-imported (no employer slug)', () => {
  const out = buildJobPostingJsonLd({
    job: baseJob,
    employer: { name: 'Cleveland Clinic', isSeeded: false, slug: null },
  })

  it('omits sameAs when employer has no public landing page', () => {
    expect(out.hiringOrganization).toMatchObject({
      '@type': 'Organization',
      name: 'Cleveland Clinic',
    })
    expect((out.hiringOrganization as Record<string, unknown>).sameAs).toBeUndefined()
    expect((out.hiringOrganization as Record<string, unknown>).logo).toBeUndefined()
  })

  it('passes validateJobPostingJsonLd with zero errors', () => {
    expect(validateJobPostingJsonLd(out)).toEqual([])
  })
})

describe('buildJobPostingJsonLd — edge cases', () => {
  it('omits baseSalary when both salary_min + salary_max are null', () => {
    const noSalary: PublicJob = { ...baseJob, salary_min: null, salary_max: null }
    const out = buildJobPostingJsonLd({ job: noSalary, employer: baseEmployer })
    expect(out.baseSalary).toBeUndefined()
  })

  it('omits baseSalary when salary is a sub-floor placeholder ($1 GS-grade)', () => {
    const placeholder: PublicJob = { ...baseJob, salary_min: 1, salary_max: null }
    const out = buildJobPostingJsonLd({ job: placeholder, employer: baseEmployer })
    expect(out.baseSalary).toBeUndefined()
  })

  it('uses QuantitativeValue.value (not a lone minValue) for one-sided salary', () => {
    // GSC WNC-10030322: a lone minValue with no `value` is flagged
    // "Missing field value (in baseSalary.value)". Single bound -> `value`.
    const floorOnly: PublicJob = { ...baseJob, salary_min: 120000, salary_max: null }
    const out = buildJobPostingJsonLd({ job: floorOnly, employer: baseEmployer })
    const qv = (out.baseSalary as { value: Record<string, unknown> }).value
    expect(qv).toMatchObject({ '@type': 'QuantitativeValue', value: 120000, unitText: 'YEAR' })
    expect(qv).not.toHaveProperty('minValue')
    expect(qv).not.toHaveProperty('maxValue')
  })

  it('uses QuantitativeValue.value for a max-only salary (the ?? fallback path)', () => {
    const ceilingOnly: PublicJob = { ...baseJob, salary_min: null, salary_max: 200000 }
    const out = buildJobPostingJsonLd({ job: ceilingOnly, employer: baseEmployer })
    const qv = (out.baseSalary as { value: Record<string, unknown> }).value
    expect(qv).toMatchObject({ '@type': 'QuantitativeValue', value: 200000, unitText: 'YEAR' })
    expect(qv).not.toHaveProperty('minValue')
    expect(qv).not.toHaveProperty('maxValue')
  })

  it('uses minValue/maxValue range when both salary bounds are set', () => {
    const both: PublicJob = { ...baseJob, salary_min: 90000, salary_max: 130000 }
    const out = buildJobPostingJsonLd({ job: both, employer: baseEmployer })
    const qv = (out.baseSalary as { value: Record<string, unknown> }).value
    expect(qv).toMatchObject({ minValue: 90000, maxValue: 130000, unitText: 'YEAR' })
    expect(qv).not.toHaveProperty('value')
  })

  it('omits experienceRequirements when experience_required is null', () => {
    const noExp: PublicJob = { ...baseJob, experience_required: null }
    const out = buildJobPostingJsonLd({ job: noExp, employer: baseEmployer })
    expect(out.experienceRequirements).toBeUndefined()
  })

  it('omits experienceRequirements when value is non-numeric (avoid content mismatch)', () => {
    const stringExp: PublicJob = { ...baseJob, experience_required: 'preferred not required' }
    const out = buildJobPostingJsonLd({ job: stringExp, employer: baseEmployer })
    expect(out.experienceRequirements).toBeUndefined()
  })

  it('strips salary suffix from title (cleanJobTitle invariant)', () => {
    const dirtyTitle: PublicJob = { ...baseJob, title: 'RN ICU – $35/hr' }
    const out = buildJobPostingJsonLd({ job: dirtyTitle, employer: baseEmployer })
    // stripSalarySuffix removes the " – $35/hr" tail
    expect(out.title as string).not.toMatch(/\$/)
  })
})

describe('validateJobPostingJsonLd — catches regressions', () => {
  const valid = buildJobPostingJsonLd({ job: baseJob, employer: baseEmployer })

  it('flags missing @context', () => {
    const broken = { ...valid, '@context': undefined }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('@context'))).toBe(true)
  })

  it('flags wrong @type', () => {
    const broken = { ...valid, '@type': 'JobListing' }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('@type'))).toBe(true)
  })

  it('flags empty title', () => {
    const broken = { ...valid, title: '' }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('title'))).toBe(true)
  })

  it('flags empty description (the historical bug that suppressed 2,300 jobs from Google for Jobs)', () => {
    const broken = { ...valid, description: '' }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('description'))).toBe(true)
  })

  it('flags missing hiringOrganization', () => {
    const broken = { ...valid, hiringOrganization: undefined }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('hiringOrganization'))).toBe(true)
  })

  it('flags REMOTE jobs that emit BOTH jobLocation AND jobLocationType (the historical bug pre-6f207bf)', () => {
    const broken = {
      ...valid,
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: { '@type': 'Country', name: 'USA' },
      // jobLocation still present from the onsite-base — this is the
      // content-mismatch shape Google rejects.
    }
    const errors = validateJobPostingJsonLd(broken)
    expect(errors.some((e) => e.includes('MUST NOT'))).toBe(true)
  })

  it('flags REMOTE jobs missing applicantLocationRequirements', () => {
    const remoteJob: PublicJob = { ...baseJob, remote_hybrid: 'remote', city: null }
    const broken = buildJobPostingJsonLd({ job: remoteJob, employer: baseEmployer })
    delete broken.applicantLocationRequirements
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('applicantLocationRequirements'))).toBe(true)
  })

  it('flags jobs missing BOTH jobLocation AND jobLocationType', () => {
    const broken = { ...valid, jobLocation: undefined, jobLocationType: undefined }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('jobLocation'))).toBe(true)
  })

  it('flags bad datePosted format', () => {
    const broken = { ...valid, datePosted: 'May 20, 2026' }
    expect(validateJobPostingJsonLd(broken).some((e) => e.includes('datePosted'))).toBe(true)
  })
})
