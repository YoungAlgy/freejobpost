import { createElement, type AnchorHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from '../app/employer/dashboard'
import type { Application } from '../app/employer/page'

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props),
}))
vi.mock('../app/employer/actions', () => ({ archiveJob: vi.fn(), logout: vi.fn() }))

// Offline display fixtures only. No server, candidate or employer is contacted.
const employer = { company_name: 'Local review employer', contact_name: null, verified_healthcare_org: false }
const job = {
  id: 'local-job', slug: 'local-review-job', title: 'Local review nurse job',
  role: null, specialty: null, city: 'Tampa', state: 'FL', remote_hybrid: null,
  employment_type: null, salary_min: 70000, salary_max: 80000, status: 'active',
  apply_count: 999, view_count: 999, created_at: '2026-09-01T12:00:00Z', expires_at: '2026-10-01T12:00:00Z',
}
function application(index: number): Application {
  return {
    application_id: `local-application-${index}`, job_id: `job-${index % 2}`, job_title: `Review role ${index % 2}`,
    job_slug: `review-role-${index % 2}`, job_city: 'Tampa', job_state: 'FL', first_name: `Review${index}`,
    last_name: 'Fixture', email: `review${index}@example.invalid`, phone: null, credential: 'RN', specialty: null,
    cover_note: 'Offline review note', status: 'submitted', applied_at: '2026-09-04T12:00:00Z', employer_notified_at: null,
  }
}

describe('standalone employer dashboard', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('separates waiting and expired posts from the live count', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [
      job, { ...job, id: 'waiting', title: 'Waiting review role', status: 'pending_review' },
      { ...job, id: 'old', title: 'Expired review role', expires_at: '2026-09-04T12:00:00Z' },
    ] }))
    expect(html).toContain('1 live job')
    expect(html).toContain('1 awaiting verification')
    expect(html.match(/>LIVE<\/span>/g)).toHaveLength(1)
    expect(html).toContain('AWAITING VERIFICATION')
    expect(html).toContain('EXPIRED')
    expect(html.indexOf('id="applications"')).toBeLessThan(html.indexOf('id="closed-jobs"'))
  })
  it('gives posting one clear primary path and section shortcuts', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [job] }))
    expect(html).toContain('Post a job')
    expect(html).toContain('aria-label="Dashboard sections"')
    expect(html).toContain('href="#applications"')
    expect(html).not.toMatch(/Ava Health|Beacon|pricing|membership/i)
    expect(html).not.toContain('999') // apply activity is not a count of submitted applications
  })
  it('keeps salary and long text available on phones', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [job] }))
    expect(html).toContain('$70K-$80K')
    expect(html).not.toContain('hidden md:inline')
    expect(html).toContain('break-words')
    expect(html).toContain('min-h-11')
  })
  it('does not pretend an empty scoped response proves no applications exist', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [] }))
    expect(html).toContain('No applications are loaded.')
    expect(html).not.toContain('No applications yet')
  })
  it('distinguishes five visible, seven loaded, and a larger backend total', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [job], applications: Array.from({ length: 7 }, (_, i) => application(i)), totalApplications: 80 }))
    expect(html).toContain('Showing 5 of 7 loaded applications.')
    expect(html).toContain('Only the 7 most recent applications are loaded, out of 80 total.')
    expect(html).toContain('Show all 7 loaded applications')
    expect(html).toContain('Filter loaded applications by job')
    expect(html.match(/mailto:/g)).toHaveLength(5)
    expect(html).toContain('aria-controls="application-list"')
  })
  it('does not add a filter when only one loaded job exists', () => {
    const html = renderToStaticMarkup(createElement(Dashboard, { employer, jobs: [job], applications: [application(0)] }))
    expect(html).not.toContain('<select')
    expect(html).not.toContain('most recent applications are loaded')
    expect(html).toContain('Read cover note')
  })
  it('keeps a synchronous lock around a confirmed filled request', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../app/employer/dashboard.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const fillInFlightRef = useRef(false)')
    expect(source).toContain('if (fillInFlightRef.current || pending || uncertain) return')
    expect(source).toContain('fillInFlightRef.current = true')
    expect(source).toContain('fillInFlightRef.current = false')
  })
})
