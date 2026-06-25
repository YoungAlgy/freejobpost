import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAshbyBoard } from './ashby'

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => response }),
  )
}
afterEach(() => vi.unstubAllGlobals())

function job(over: Record<string, unknown> = {}) {
  return {
    id: 'j1',
    title: 'Registered Nurse',
    department: 'Nursing',
    employmentType: 'FullTime',
    location: 'Tampa, FL',
    workplaceType: 'OnSite',
    descriptionPlain: 'Care for patients.',
    jobUrl: 'https://jobs.ashbyhq.com/acme/j1',
    ...over,
  }
}

describe('fetchAshbyBoard', () => {
  it('prefers the structured postalAddress (full state name) for city/state', async () => {
    mockFetch({
      jobs: [
        job({
          id: 'a',
          location: undefined,
          address: { postalAddress: { addressLocality: 'Savannah', addressRegion: 'Georgia' } },
        }),
      ],
    })
    const r = await fetchAshbyBoard('acme')
    expect(r.jobs[0]).toMatchObject({ city: 'Savannah', state: 'GA' })
  })

  it('drops non-US and non-healthcare, maps fields, and counts', async () => {
    mockFetch({
      jobs: [
        job({ id: 'a', title: 'ICU Nurse', location: 'Miami, FL', employmentType: 'PartTime' }),
        job({ id: 'b', title: 'Registered Nurse', location: 'Toronto, Canada' }), // non-US
        job({ id: 'c', title: 'Software Engineer', department: 'Engineering', location: 'Austin, TX' }), // non-healthcare
      ],
    })
    const r = await fetchAshbyBoard('acme')
    expect(r.provider).toBe('ashby')
    expect(r.totalFetched).toBe(3)
    expect(r.totalUsKept).toBe(1)
    expect(r.droppedNonUs).toBe(1)
    expect(r.droppedNonHealthcare).toBe(1)
    expect(r.jobs[0]).toMatchObject({
      external_id: 'a',
      title: 'ICU Nurse',
      city: 'Miami',
      state: 'FL',
      employment_type: 'part_time',
      salary_min: null,
      source: 'ashby:acme',
    })
  })

  it('marks remote from workplaceType/isRemote', async () => {
    mockFetch({
      jobs: [job({ id: 'r', location: 'Remote', workplaceType: 'Remote' })],
    })
    const r = await fetchAshbyBoard('acme')
    expect(r.jobs[0].remote_hybrid).toBe('remote')
  })

  it('falls back to descriptionHtml (stripped) and a constructed apply_url', async () => {
    mockFetch({
      jobs: [
        job({
          id: 'd',
          descriptionPlain: undefined,
          descriptionHtml: '<p>Strip <b>me</b></p>',
          jobUrl: undefined,
          applyUrl: undefined,
        }),
      ],
    })
    const r = await fetchAshbyBoard('acme')
    expect(r.jobs[0].description).toBe('Strip me')
    expect(r.jobs[0].apply_url).toBe('https://jobs.ashbyhq.com/acme/d')
  })

  it('throws on a non-ok response', async () => {
    mockFetch({}, false, 500)
    await expect(fetchAshbyBoard('down')).rejects.toThrow(/returned 500/)
  })
})
