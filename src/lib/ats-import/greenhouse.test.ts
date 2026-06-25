import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGreenhouseBoard } from './greenhouse'

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => response }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const BOARD = {
  jobs: [
    {
      id: 1,
      title: 'Registered Nurse',
      updated_at: '2026-06-01T00:00:00Z',
      location: { name: 'Tampa, FL, United States' },
      absolute_url: 'https://employer.example/1',
      content: '<p>Great <b>RN</b> role</p>',
      departments: [{ name: 'Nursing' }],
    },
    {
      id: 2,
      title: 'Registered Nurse',
      updated_at: '2026-06-01T00:00:00Z',
      location: { name: 'London, UK' }, // healthcare but non-US -> dropped
      absolute_url: 'https://employer.example/2',
      content: '',
    },
    {
      id: 3,
      title: 'Software Engineer', // US but non-healthcare -> dropped
      updated_at: '2026-06-01T00:00:00Z',
      location: { name: 'Austin, TX, United States' },
      absolute_url: 'https://employer.example/3',
      content: '',
    },
  ],
}

describe('fetchGreenhouseBoard', () => {
  it('keeps US healthcare jobs, drops non-US and non-healthcare, and maps fields', async () => {
    mockFetch(BOARD)
    const result = await fetchGreenhouseBoard('acme')

    expect(result.provider).toBe('greenhouse')
    expect(result.totalFetched).toBe(3)
    expect(result.totalUsKept).toBe(1)
    expect(result.droppedNonUs).toBe(1) // the London RN
    expect(result.droppedNonHealthcare).toBe(1) // the Software Engineer
    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]).toMatchObject({
      external_id: '1',
      title: 'Registered Nurse',
      description: 'Great RN role', // HTML decoded + tags stripped
      apply_url: 'https://employer.example/1',
      city: 'Tampa',
      state: 'FL',
      remote_hybrid: 'onsite',
      employment_type: 'full_time',
      salary_min: null,
      salary_max: null,
      source: 'greenhouse:acme',
    })
  })

  it('constructs an apply_url when absolute_url is missing', async () => {
    mockFetch({
      jobs: [
        {
          id: 99,
          title: 'ICU Nurse',
          updated_at: 't',
          location: { name: 'Miami, FL, United States' },
          departments: [],
        },
      ],
    })
    const r = await fetchGreenhouseBoard('beta')
    expect(r.jobs[0].apply_url).toBe('https://boards.greenhouse.io/beta/jobs/99')
  })

  it('returns an empty result when the board has no jobs', async () => {
    mockFetch({ jobs: [] })
    const r = await fetchGreenhouseBoard('empty')
    expect(r.jobs).toEqual([])
    expect(r.totalFetched).toBe(0)
  })

  it('throws on a non-ok response', async () => {
    mockFetch({}, false, 503)
    await expect(fetchGreenhouseBoard('down')).rejects.toThrow(/returned 503/)
  })
})
