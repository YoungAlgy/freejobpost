import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLeverBoard } from './lever'

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => response }),
  )
}
afterEach(() => vi.unstubAllGlobals())

// A US healthcare posting builder, overridable per-test.
function posting(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    text: 'Registered Nurse',
    categories: { location: 'Tampa, FL', department: 'Nursing', commitment: 'Full-time' },
    descriptionPlain: 'Care for patients.',
    hostedUrl: 'https://jobs.lever.co/acme/p1',
    workplaceType: 'onsite',
    ...over,
  }
}

describe('fetchLeverBoard salary normalization', () => {
  it('keeps an annual USD salary range', async () => {
    mockFetch([posting({ salaryRange: { min: 80000, max: 100000, currency: 'USD', interval: 'per-year-salary' } })])
    const r = await fetchLeverBoard('acme')
    expect(r.jobs[0].salary_min).toBe(80000)
    expect(r.jobs[0].salary_max).toBe(100000)
  })

  it.each([
    ['per-month-salary'],
    ['per-week-salary'],
    ['per-quarter-salary'],
    ['per-half-year-salary'], // contains "year" but is NOT annual
    ['per-hour-wage'],
    ['per-day-wage'],
    ['one-time-commission'],
  ])('drops a non-annual interval (%s) to null rather than mis-stating it as annual', async (interval) => {
    mockFetch([posting({ salaryRange: { min: 8000, max: 9000, currency: 'USD', interval } })])
    const r = await fetchLeverBoard('acme')
    expect(r.jobs[0].salary_min).toBeNull()
    expect(r.jobs[0].salary_max).toBeNull()
  })

  it('drops a non-USD salary', async () => {
    mockFetch([posting({ salaryRange: { min: 80000, max: 100000, currency: 'EUR', interval: 'per-year-salary' } })])
    const r = await fetchLeverBoard('acme')
    expect(r.jobs[0].salary_min).toBeNull()
  })

  it('keeps a range with no interval specified (assumed annual)', async () => {
    mockFetch([posting({ salaryRange: { min: 70000, max: 90000 } })])
    const r = await fetchLeverBoard('acme')
    expect(r.jobs[0].salary_min).toBe(70000)
  })
})

describe('fetchLeverBoard filtering + mapping', () => {
  it('drops non-US and non-healthcare, maps fields + counts', async () => {
    mockFetch([
      posting({ id: 'a', text: 'ICU Nurse', categories: { location: 'Miami, FL', department: 'Nursing', commitment: 'Part-time' }, workplaceType: 'hybrid' }),
      posting({ id: 'b', text: 'Registered Nurse', categories: { location: 'London, UK' } }), // non-US
      posting({ id: 'c', text: 'Software Engineer', categories: { location: 'Austin, TX' } }), // non-healthcare
    ])
    const r = await fetchLeverBoard('acme')
    expect(r.provider).toBe('lever')
    expect(r.totalFetched).toBe(3)
    expect(r.totalUsKept).toBe(1)
    expect(r.droppedNonUs).toBe(1)
    expect(r.droppedNonHealthcare).toBe(1)
    expect(r.jobs[0]).toMatchObject({
      external_id: 'a',
      title: 'ICU Nurse',
      city: 'Miami',
      state: 'FL',
      remote_hybrid: 'hybrid',
      employment_type: 'part_time',
      source: 'lever:acme',
    })
  })

  it('falls back to descriptionPlain, then stripped description, then a constructed apply_url', async () => {
    mockFetch([
      posting({ id: 'd', descriptionPlain: '', description: '<p>Strip <b>me</b></p>', hostedUrl: undefined, applyUrl: undefined }),
    ])
    const r = await fetchLeverBoard('acme')
    expect(r.jobs[0].description).toBe('Strip me')
    expect(r.jobs[0].apply_url).toBe('https://jobs.lever.co/acme/d')
  })

  it('throws on a non-ok response', async () => {
    mockFetch([], false, 502)
    await expect(fetchLeverBoard('down')).rejects.toThrow(/returned 502/)
  })
})
