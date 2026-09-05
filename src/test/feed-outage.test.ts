import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn<typeof fetch>() }))
vi.mock('@/lib/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase')>()
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://unit-test.invalid', 'unit-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchMock },
  })
  return { ...original, supabase: client, supabaseFresh: client }
})

import { GET as jobsXml } from '@/app/jobs.xml/route'
import { GET as indeedXml } from '@/app/feeds/indeed.xml/route'
import { GET as originatedXml } from '@/app/feeds/originated.xml/route'
import { GET as linkedinXml } from '@/app/feeds/linkedin.xml/route'
import { GET as rssXml } from '@/app/feeds/rss.xml/route'
import { GET as stateRss } from '@/app/feeds/state/[slug]/route'
import { GET as specialtyRss } from '@/app/feeds/specialty/[slug]/route'
import { PUBLIC_READ_TIMEOUT_MS } from '@/lib/public-read-deadline'

const heavyRoutes = [
  ['jobs.xml', jobsXml],
  ['indeed.xml', indeedXml],
  ['originated.xml', originatedXml],
  ['linkedin.xml', linkedinXml],
] as const

function request(signal?: AbortSignal) {
  return new NextRequest('https://unit-test.invalid/feed', { signal })
}

function countResponse(count: number) {
  return new Response(null, { headers: { 'Content-Range': `*/${count}` } })
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function stalledRead(_url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) reject(signal.reason)
    else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => { throw new Error('Unexpected extra database read') })
  vi.stubEnv('NEXT_PHASE', 'phase-production-server')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network call in unit test') }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe.each(heavyRoutes)('%s outage containment with the installed database client', (_label, route) => {
  it('stops at the failed count without retries or range-query fanout', async () => {
    fetchMock.mockImplementation(async () => json({ message: 'unavailable' }, 503))
    await expect(route(request())).rejects.toThrow('active job count failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('HEAD')
  })

  it('aborts a stalled count at the deadline without extra database calls', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(stalledRead)
    const result = route(request())
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(PUBLIC_READ_TIMEOUT_MS)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('makes no reads for an already aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(route(request(controller.signal))).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still returns valid cacheable XML for a successfully empty inventory', async () => {
    fetchMock.mockResolvedValueOnce(countResponse(0)).mockResolvedValueOnce(json([]))
    const response = await route(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=21600, stale-while-revalidate=86400')
    expect(await response.text()).toContain('<?xml')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, options] of fetchMock.mock.calls) {
      const query = new URL(String(url)).searchParams
      expect(query.get('source')).toBe('eq.public_employer_post')
      expect(query.get('company_name')).toBe('not.ilike.Ava Health%')
      expect(query.get('status')).toBe('eq.active')
      expect(query.get('deleted_at')).toBe('is.null')
      expect(options?.signal).toBe(fetchMock.mock.calls[0][1]?.signal)
    }
  })

  it('refuses partial XML and stops later waves after a batch error', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      return init?.method === 'HEAD' ? countResponse(20_000) : json({ message: 'unavailable' }, 520)
    })
    await expect(route(request())).rejects.toThrow('refusing to cache a partial feed')
    expect(fetchMock).toHaveBeenCalledTimes(9)
  })
})

describe('feed shared-deadline and RSS coverage', () => {
  it('shares the original deadline with the final employer lookup', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // A unit-only row, used solely by the mocked client in this process.
    const row = {
      id: 'unit-job', slug: 'unit-nurse', title: 'Registered Nurse',
      description: 'Nursing responsibilities. '.repeat(40), employer_id: 'unit-employer',
      updated_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z',
      expires_at: '2026-10-01T00:00:00Z',
    }
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'HEAD') {
        return new Promise((resolve) => setTimeout(() => resolve(countResponse(1)), 5_000))
      }
      if (String(url).includes('/public_employers_directory')) return stalledRead(url, init)
      const offset = new URL(String(url)).searchParams.get('offset')
      return Promise.resolve(json(offset === '0' ? [row] : []))
    })
    const result = jobsXml(request())
    const assertion = expect(result).rejects.toThrow('jobs.xml data load timed out after 15000ms')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    const signal = fetchMock.mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(true)
    for (const [, options] of fetchMock.mock.calls) expect(options?.signal).toBe(signal)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['rss', (req: NextRequest) => rssXml(req)],
    ['state RSS', (req: NextRequest) => stateRss(req, { params: Promise.resolve({ slug: 'florida' }) })],
    ['specialty RSS', (req: NextRequest) => specialtyRss(req, { params: Promise.resolve({ slug: 'registered-nurse' }) })],
  ] as const)('cancels %s without an empty successful response', async (_label, route) => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(stalledRead)
    const result = route(request())
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(PUBLIC_READ_TIMEOUT_MS)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})
