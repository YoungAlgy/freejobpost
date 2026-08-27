import { beforeEach, describe, expect, it, vi } from 'vitest'

const sitemapMocks = vi.hoisted(() => ({
  buildChildSitemap: vi.fn(),
  xmlResponse: vi.fn(),
}))

vi.mock('@/lib/sitemap-chunks', () => ({
  SITEMAP_CHILDREN: ['pages.xml', 'jobs-0.xml'],
  SITEMAP_ISR_REQUEST_TIMEOUT_MS: 2_000,
  buildChildSitemap: sitemapMocks.buildChildSitemap,
  xmlResponse: sitemapMocks.xmlResponse,
}))

import { GET } from './route'

describe('sitemap child route', () => {
  beforeEach(() => {
    sitemapMocks.buildChildSitemap.mockReset()
    sitemapMocks.xmlResponse.mockReset()
    sitemapMocks.buildChildSitemap.mockResolvedValue('<urlset />')
    sitemapMocks.xmlResponse.mockImplementation(
      (xml: string) => new Response(xml, { headers: { 'Content-Type': 'application/xml' } }),
    )
  })

  it('passes the Worker request signal into the child builder', async () => {
    const requestController = new AbortController()
    const request = new Request('https://freejobpost.co/sitemaps/jobs-0.xml', {
      signal: requestController.signal,
    })

    const response = await GET(request, {
      params: Promise.resolve({ chunk: 'jobs-0.xml' }),
    })

    expect(response.status).toBe(200)
    expect(sitemapMocks.buildChildSitemap).toHaveBeenCalledWith(
      'jobs-0.xml',
      request.signal,
    )
  })

  it('ends ISR work before the OpenNext queue deadline and throws to retain last-good ISR', async () => {
    vi.useFakeTimers()
    try {
      let loaderSignal: AbortSignal | undefined
      let loaderSettled = false
      sitemapMocks.buildChildSitemap.mockImplementation(
        (_chunk: string, signal?: AbortSignal) => new Promise<string>((_resolve, reject) => {
          loaderSignal = signal
          signal?.addEventListener('abort', () => {
            setTimeout(() => {
              loaderSettled = true
              reject(signal.reason)
            }, 25)
          }, { once: true })
        }),
      )
      const request = new Request('https://freejobpost.co/sitemaps/jobs-0.xml', {
        method: 'HEAD',
      })

      const responsePromise = GET(request, {
        params: Promise.resolve({ chunk: 'jobs-0.xml' }),
      })
      const rejection = expect(responsePromise).rejects.toMatchObject({ name: 'TimeoutError' })
      await vi.advanceTimersByTimeAsync(0)

      expect(loaderSignal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1_999)
      expect(loaderSignal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)

      expect(loaderSignal?.aborted).toBe(true)
      expect(loaderSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(24)
      expect(loaderSettled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)

      await rejection
      expect(loaderSettled).toBe(true)
      expect(loaderSignal?.reason).toMatchObject({ name: 'TimeoutError' })
    } finally {
      vi.useRealTimers()
    }
  })
})
