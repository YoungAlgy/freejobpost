import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

const { from, queries, responses } = vi.hoisted(() => ({
  from: vi.fn(),
  queries: [] as Record<string, ReturnType<typeof vi.fn>>[],
  responses: [] as Array<{ data: unknown; error: { code: string; message: string } | null }>,
}))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase')>()
  return { ...original, supabase: { from } }
})

import JobDetailPage, { generateMetadata } from '@/app/jobs/[slug]/page'
import { PUBLIC_READ_TIMEOUT_MS } from '@/lib/public-read-deadline'

function props(slug = 'unit-test-nurse') {
  return { params: Promise.resolve({ slug }) }
}

// Unit-only data and a fully mocked database. No live listing is created.
const job = {
  id: 'unit-job', title: 'Registered Nurse', slug: 'unit-test-nurse',
  city: 'Tampa', state: 'FL', description: 'Direct nursing role. '.repeat(40),
}

beforeEach(() => {
  queries.length = 0
  responses.length = 0
  from.mockReset()
  vi.stubEnv('NEXT_PHASE', 'phase-production-server')
  // Vitest's JSX transform is classic. Next's production transform is automatic.
  vi.stubGlobal('React', React)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network call in unit test') }))
  from.mockImplementation(() => {
    const response = responses.shift()
    if (!response) throw new Error('Unexpected additional database query')
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ['select', 'eq', 'not', 'is', 'gt', 'or', 'neq', 'order', 'limit', 'maybeSingle', 'abortSignal', 'retry']) {
      query[method] = vi.fn(() => query)
    }
    query.then = vi.fn((resolve) => Promise.resolve(response).then(resolve))
    queries.push(query)
    return query
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('job detail outage containment', () => {
  it.each([
    ['522', 'upstream connection timed out'],
    ['42501', 'permission denied for table public_jobs'],
    ['42703', 'column public_jobs.company_name does not exist'],
    ['', 'TypeError: fetch failed'],
  ])('does not issue a fallback or closed query for %s', async (code, message) => {
    responses.push({ data: null, error: { code, message } })
    await expect(generateMetadata(props())).rejects.toThrow('getJob(unit-test-nurse): query failed')
    expect(from).toHaveBeenCalledTimes(1)
    expect(queries[0].retry).toHaveBeenCalledWith(false)
    expect(queries[0].abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('keeps the exact missing-target-column fallback within the same deadline', async () => {
    responses.push(
      { data: null, error: { code: '42703', message: 'column public_jobs.syndication_targets does not exist' } },
      { data: job, error: null },
    )
    const metadata = await generateMetadata(props())
    expect(metadata.title).toContain('Registered Nurse')
    expect(from).toHaveBeenCalledTimes(2)
    expect(queries[0].abortSignal.mock.calls[0][0]).toBe(queries[1].abortSignal.mock.calls[0][0])
    expect(queries[1].select.mock.calls[0][0]).not.toContain('syndication_targets')
    expect(queries[1].retry).toHaveBeenCalledWith(false)
  })

  it('throws when the legacy fallback also fails', async () => {
    responses.push(
      { data: null, error: { code: '42703', message: 'column public_jobs.syndication_targets does not exist' } },
      { data: null, error: { code: '522', message: 'upstream timeout' } },
    )
    await expect(generateMetadata(props())).rejects.toThrow('fallback: query failed')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('does not turn a failed closed-job read into Job not found metadata', async () => {
    responses.push(
      { data: null, error: null },
      { data: null, error: { code: '522', message: 'upstream timeout' } },
    )
    await expect(generateMetadata(props())).rejects.toThrow('getClosedJob(unit-test-nurse): query failed')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('still returns not-found metadata for two successful empty reads', async () => {
    responses.push({ data: null, error: null }, { data: null, error: null })
    const metadata = await generateMetadata(props())
    expect(metadata.title).toBe('Job not found')
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('keeps successful closed-job metadata', async () => {
    responses.push({ data: null, error: null }, { data: job, error: null })
    const metadata = await generateMetadata(props())
    expect(metadata.title).toContain('(position closed)')
  })

  it('rejects invalid slugs without touching the database', async () => {
    expect((await generateMetadata(props('../private'))).title).toBe('Job not found')
    expect(from).not.toHaveBeenCalled()
  })

  it('aborts a stalled job read without issuing the legacy fallback', async () => {
    vi.useFakeTimers()
    responses.push({ data: null, error: null })
    const baseImplementation = from.getMockImplementation()!
    from.mockImplementation(() => {
      const query = baseImplementation()
      query.then.mockImplementation((resolve: (value: unknown) => unknown) => {
        const signal = query.abortSignal.mock.calls[0][0] as AbortSignal
        return new Promise((settle) => signal.addEventListener('abort', () => {
          settle(resolve({ data: null, error: { code: '', message: 'AbortError' } }))
        }, { once: true }))
      })
      return query
    })
    const result = generateMetadata(props())
    const assertion = expect(result).rejects.toThrow('job detail timed out')
    await vi.advanceTimersByTimeAsync(PUBLIC_READ_TIMEOUT_MS)
    await assertion
    expect(from).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the real page notFound branch for two successful empty reads', async () => {
    responses.push({ data: null, error: null }, { data: null, error: null })
    await expect(JobDetailPage(props())).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('does not reach the page notFound branch when a closed-job lookup fails', async () => {
    responses.push(
      { data: null, error: null },
      { data: null, error: { code: '522', message: 'database unavailable' } },
    )
    await expect(JobDetailPage(props())).rejects.toThrow('getClosedJob(unit-test-nurse): query failed')
    expect(from).toHaveBeenCalledTimes(2)
  })

  it.each(['slug', 'verified_via'])('preserves closed-job recovery and the missing %s employer fallback', async (column) => {
    const closed = { ...job, employer_id: 'unit-employer' }
    responses.push(
      { data: null, error: null },
      { data: closed, error: null },
      { data: [], error: null },
      { data: null, error: { code: '42703', message: `column public_employers_directory.${column} does not exist` } },
      { data: { company_name: 'Unit Employer', verified_at: null }, error: null },
    )
    const page = await JobDetailPage(props())
    expect(page.props.job).toBe(closed)
    expect(page.props.related).toEqual([])
    expect(page.props.employerName).toBe('Unit Employer')
    expect(from).toHaveBeenCalledTimes(5)
    expect(queries[3].abortSignal.mock.calls[0][0]).toBe(queries[4].abortSignal.mock.calls[0][0])
    expect(queries[4].retry).toHaveBeenCalledWith(false)
  })

  it('does not retry an optional employer lookup during an outage', async () => {
    responses.push(
      { data: null, error: null },
      { data: { ...job, employer_id: 'unit-employer' }, error: null },
      { data: [], error: null },
      { data: null, error: { code: '522', message: 'database unavailable' } },
    )
    const page = await JobDetailPage(props())
    expect(page.props.employerName).toBe('Employer')
    expect(from).toHaveBeenCalledTimes(4)
  })

  it('waits for the sibling optional read to settle after an unexpected rejection', async () => {
    vi.useFakeTimers()
    responses.push(
      { data: job, error: null },
      { data: [], error: null },
    )
    const baseImplementation = from.getMockImplementation()!
    let siblingSettled = false
    let pageSettled = false
    from.mockImplementation(() => {
      const query = baseImplementation()
      if (queries.length === 2) {
        query.then.mockImplementation((resolve: (value: unknown) => unknown) => {
          const signal = query.abortSignal.mock.calls[0][0] as AbortSignal
          return new Promise((settle) => signal.addEventListener('abort', () => {
            siblingSettled = true
            settle(resolve({ data: [], error: null }))
          }, { once: true }))
        })
      }
      return query
    })
    // The third query throws synchronously before returning a builder.
    responses[0].data = { ...job, employer_id: 'unit-employer' }
    const result = JobDetailPage(props())
    const tracked = result.then(() => { pageSettled = true }, () => { pageSettled = true })
    const assertion = expect(result).rejects.toThrow('related jobs timed out')
    await vi.advanceTimersByTimeAsync(1)
    expect(pageSettled).toBe(false)
    expect(siblingSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(PUBLIC_READ_TIMEOUT_MS)
    await assertion
    await tracked
    expect(siblingSettled).toBe(true)
    expect(pageSettled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
