import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkdayBoard, type WorkdayBoardCfg } from './workday'

const CFG: WorkdayBoardCfg = {
  tenantHost: 'ccf.wd1.myworkdayjobs.com',
  tenant: 'ccf',
  site: 'Careers',
  defaultState: 'OH',
}

// Workday hits two endpoints: a POST listing and a GET detail. The mock routes
// by method and (for detail) by which externalPath the URL contains.
function mockBoard(listing: unknown, detailByPath: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opts?: { method?: string }) => {
      if (opts?.method === 'POST') {
        return { ok: true, status: 200, json: async () => listing }
      }
      const path = Object.keys(detailByPath).find((p) => url.includes(p))
      return { ok: true, status: 200, json: async () => (path ? detailByPath[path] : { jobPostingInfo: {} }) }
    }),
  )
}
afterEach(() => vi.unstubAllGlobals())

function listItem(over: Record<string, unknown> = {}) {
  return {
    title: 'Registered Nurse',
    externalPath: '/job/A/RN_1',
    locationsText: 'Tampa, FL',
    timeType: 'Full time',
    remoteType: 'On-site',
    ...over,
  }
}
function detail(info: Record<string, unknown> = {}) {
  return { jobPostingInfo: { jobDescription: '<p>Care for patients</p>', location: 'Tampa, FL', ...info } }
}

describe('fetchWorkdayBoard', () => {
  it('enriches, filters non-healthcare, maps fields, and keeps an annual USD salary', async () => {
    mockBoard(
      {
        total: 2,
        jobPostings: [
          listItem({ externalPath: '/job/A/RN_1' }),
          listItem({ title: 'Software Engineer', externalPath: '/job/A/SWE_2', locationsText: 'Cleveland' }),
        ],
      },
      {
        '/job/A/RN_1': detail({
          payRangeMinimum: '80000',
          payRangeMaximum: '100000',
          payRangeFrequency: 'Yearly',
          payRangeCurrency: 'USD',
        }),
      },
    )
    const r = await fetchWorkdayBoard(CFG, { enrichAll: true })
    expect(r.provider).toBe('workday')
    expect(r.totalFetched).toBe(2)
    expect(r.totalUsKept).toBe(1)
    expect(r.droppedNonHealthcare).toBe(1)
    expect(r.jobs[0]).toMatchObject({
      external_id: '/job/A/RN_1',
      title: 'Registered Nurse',
      description: 'Care for patients', // from the detail HTML, stripped
      city: 'Tampa',
      state: 'FL',
      remote_hybrid: 'onsite',
      employment_type: 'full_time',
      salary_min: 80000,
      salary_max: 100000,
      source: 'workday:ccf/Careers',
    })
    expect(r.jobs[0].apply_url).toBe('https://ccf.wd1.myworkdayjobs.com/Careers/job/A/RN_1')
  })

  it('annualizes an hourly USD pay range by 2080', async () => {
    mockBoard(
      { total: 1, jobPostings: [listItem({ externalPath: '/job/A/RN_h' })] },
      { '/job/A/RN_h': detail({ payRangeMinimum: '40', payRangeMaximum: '60', payRangeFrequency: 'Hourly', payRangeCurrency: 'USD' }) },
    )
    const r = await fetchWorkdayBoard(CFG, { enrichAll: true })
    expect(r.jobs[0].salary_min).toBe(83200) // 40 * 2080
    expect(r.jobs[0].salary_max).toBe(124800) // 60 * 2080
  })

  it('clamps an absurd salary to null (int4 overflow guard) and ignores non-USD', async () => {
    mockBoard(
      { total: 1, jobPostings: [listItem({ externalPath: '/job/A/RN_big' })] },
      { '/job/A/RN_big': detail({ payRangeMinimum: '5000000', payRangeMaximum: '9000000', payRangeFrequency: 'Yearly', payRangeCurrency: 'USD' }) },
    )
    expect((await fetchWorkdayBoard(CFG, { enrichAll: true })).jobs[0].salary_min).toBeNull()

    mockBoard(
      { total: 1, jobPostings: [listItem({ externalPath: '/job/A/RN_eur' })] },
      { '/job/A/RN_eur': detail({ payRangeMinimum: '80000', payRangeMaximum: '100000', payRangeFrequency: 'Yearly', payRangeCurrency: 'EUR' }) },
    )
    expect((await fetchWorkdayBoard(CFG, { enrichAll: true })).jobs[0].salary_min).toBeNull()
  })

  it('falls back to defaultState for a brand-named facility location', async () => {
    mockBoard(
      { total: 1, jobPostings: [listItem({ title: 'ICU Nurse', externalPath: '/job/A/ICU', locationsText: 'Cleveland Clinic Main Campus' })] },
      { '/job/A/ICU': detail({ location: undefined }) },
    )
    const r = await fetchWorkdayBoard(CFG, { enrichAll: true })
    expect(r.jobs[0].state).toBe('OH') // defaultState fallback
    expect(r.jobs[0].city).toBeNull()
  })

  it('uses listing data (no detail fetch, no salary) when not enriching', async () => {
    mockBoard(
      { total: 1, jobPostings: [listItem({ externalPath: '/job/A/RN_ne', jobDescription: '<p>Listing desc</p>' })] },
    )
    const r = await fetchWorkdayBoard(CFG, {}) // no enrichAll / enrichRefs
    expect(r.jobs[0].description).toBe('Listing desc')
    expect(r.jobs[0].salary_min).toBeNull()
  })

  it('throws when the listing endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(fetchWorkdayBoard(CFG, {})).rejects.toThrow(/listing/)
  })
})
