import { describe, it, expect, vi } from 'vitest'
import {
  JOB_SITEMAP_CHUNKS,
  PAGES_SITEMAP_CHILD,
  SITEMAP_BASE,
  SITEMAP_CHILDREN,
  SITEMAP_DATA_TIMEOUT_MS,
  SITEMAP_REVALIDATE,
  buildJobChunkSitemap,
  buildPagesSitemap,
  buildSitemapIndex,
  fetchSitemapJobChunkRows,
  parseSitemapChild,
  renderSitemapIndex,
  renderUrlset,
  runSitemapLoaderWithDeadline,
  sitemapChildUrl,
  sitemapJobIdRange,
  type PagesSitemapDependencies,
  type SitemapJobPageFetcher,
  type SitemapJobRow,
} from '@/lib/sitemap-chunks'
import { FEDERAL_AGENCIES } from '@/lib/federal-agencies'
import { STATE_HUBS } from '@/lib/state-slugs'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'

// Next rejects an imported identifier in a route's segment config ("Invalid
// segment configuration export detected" — it fails the whole build), so
// src/app/sitemap.xml/route.ts and src/app/sitemaps/[chunk]/route.ts each carry
// an inline `export const revalidate = 21600`. Those literals cannot import this
// constant, so this test is what keeps the three values from drifting: if you
// change SITEMAP_REVALIDATE, change both route literals and this number too.
describe('SITEMAP_REVALIDATE', () => {
  it('matches the inline `export const revalidate` literal in both sitemap routes', () => {
    expect(SITEMAP_REVALIDATE).toBe(21600)
  })
})

describe('runSitemapLoaderWithDeadline', () => {
  it('aborts at the deadline and waits for request settlement before rejecting', async () => {
    vi.useFakeTimers()
    let aborted = false
    let abortReasonName: string | undefined
    let requestSettled = false
    let loaderSettled = false

    try {
      const resultPromise = runSitemapLoaderWithDeadline(
        'test sitemap loader',
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted = true
                abortReasonName = (signal.reason as { name?: string } | undefined)?.name
                setTimeout(() => {
                  requestSettled = true
                  reject(new DOMException('Request aborted', 'AbortError'))
                }, 25)
              },
              { once: true },
            )
          }),
        SITEMAP_DATA_TIMEOUT_MS,
      )
      const tracked = resultPromise.then(
        () => {
          loaderSettled = true
        },
        () => {
          loaderSettled = true
        },
      )
      const assertion = expect(resultPromise).rejects.toThrow(
        `test sitemap loader timed out after ${SITEMAP_DATA_TIMEOUT_MS}ms`,
      )

      await vi.advanceTimersByTimeAsync(SITEMAP_DATA_TIMEOUT_MS)
      expect(aborted).toBe(true)
      expect(abortReasonName).toBe('AbortError')
      expect(requestSettled).toBe(false)
      expect(loaderSettled).toBe(false)

      await vi.advanceTimersByTimeAsync(25)
      await assertion
      await tracked
      expect(requestSettled).toBe(true)
      expect(loaderSettled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('normalizes an upstream timeout for PostgREST and waits for loader settlement', async () => {
    vi.useFakeTimers()
    const requestController = new AbortController()
    let loaderAbortReasonName: string | undefined
    let requestSettled = false
    let loaderSettled = false

    try {
      const resultPromise = runSitemapLoaderWithDeadline(
        'request-bound sitemap loader',
        (signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                loaderAbortReasonName = (signal.reason as { name?: string } | undefined)?.name
                setTimeout(() => {
                  requestSettled = true
                  reject(new DOMException('Request aborted', 'AbortError'))
                }, 25)
              },
              { once: true },
            )
          }),
        SITEMAP_DATA_TIMEOUT_MS,
        requestController.signal,
      )
      const tracked = resultPromise.then(
        () => {
          loaderSettled = true
        },
        () => {
          loaderSettled = true
        },
      )
      const assertion = expect(resultPromise).rejects.toMatchObject({ name: 'TimeoutError' })

      requestController.abort(new DOMException('ISR request timed out', 'TimeoutError'))
      expect(loaderAbortReasonName).toBe('AbortError')
      expect(requestSettled).toBe(false)
      expect(loaderSettled).toBe(false)

      await vi.advanceTimersByTimeAsync(25)
      await assertion
      await tracked
      expect(requestSettled).toBe(true)
      expect(loaderSettled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SITEMAP_CHILDREN', () => {
  it('is the pages sitemap plus exactly JOB_SITEMAP_CHUNKS job chunks', () => {
    expect(SITEMAP_CHILDREN).toHaveLength(JOB_SITEMAP_CHUNKS + 1)
    expect(SITEMAP_CHILDREN[0]).toBe(PAGES_SITEMAP_CHILD)
  })

  it('has no duplicates', () => {
    expect(new Set(SITEMAP_CHILDREN).size).toBe(SITEMAP_CHILDREN.length)
  })

  // The whole point of the shared constant: robots.ts, the <sitemapindex>, and
  // generateStaticParams all read this list, and the route dispatcher must
  // accept every entry. If these ever disagree, robots.txt advertises a 404 or a
  // generated child goes unlinked — both silent SEO failures.
  it('every entry is routable by the dispatcher', () => {
    for (const child of SITEMAP_CHILDREN) {
      expect(parseSitemapChild(child), child).not.toBeNull()
    }
  })

  it('rejects anything not in the list', () => {
    for (const bad of [
      'jobs-20.xml',                  // one past the end
      'jobs--1.xml',
      'jobs-1',                       // missing extension
      'jobs-01.xml',                  // leading zero is a different string
      'jobs-1.5.xml',
      'pages',
      '',
      '../robots.txt',
      'jobs-0.xml/../../etc/passwd',
    ]) {
      expect(parseSitemapChild(bad), bad).toBeNull()
    }
  })

  it('builds child URLs under /sitemaps/', () => {
    expect(sitemapChildUrl('jobs-3.xml')).toBe(`${SITEMAP_BASE}/sitemaps/jobs-3.xml`)
  })
})

describe('sitemapJobIdRange', () => {
  const ranges = Array.from(
    { length: JOB_SITEMAP_CHUNKS },
    (_, chunk) => sitemapJobIdRange(chunk),
  )

  it('covers the UUID keyspace with contiguous, non-overlapping ranges', () => {
    expect(ranges[0].lowerInclusive).toBeNull()
    expect(ranges.at(-1)?.upperExclusive).toBeNull()
    for (let chunk = 0; chunk < ranges.length - 1; chunk++) {
      expect(ranges[chunk].upperExclusive).toBe(ranges[chunk + 1].lowerInclusive)
    }
  })

  it('assigns every possible first UUID byte to exactly one range', () => {
    for (let byte = 0; byte < 256; byte++) {
      const prefix = byte.toString(16).padStart(2, '0')
      const id = `${prefix}000000-0000-0000-0000-000000000000`
      const matches = ranges.filter(
        (range) =>
          (range.lowerInclusive === null || id >= range.lowerInclusive) &&
          (range.upperExclusive === null || id < range.upperExclusive),
      )
      expect(matches, `first byte ${prefix}`).toHaveLength(1)
    }
  })

  it('rejects invalid chunk inputs', () => {
    expect(() => sitemapJobIdRange(-1)).toThrow(RangeError)
    expect(() => sitemapJobIdRange(JOB_SITEMAP_CHUNKS)).toThrow(RangeError)
    expect(() => sitemapJobIdRange(0, 0)).toThrow(RangeError)
    expect(() => sitemapJobIdRange(0, 257)).toThrow(RangeError)
  })
})

function sitemapJobRow(index: number, slug = `job-${index}`): SitemapJobRow {
  return {
    id: `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    slug,
    updated_at: '2026-08-27T12:00:00.000Z',
  }
}

describe('fetchSitemapJobChunkRows', () => {
  it('keyset-paginates one UUID range without fetching the full corpus', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => sitemapJobRow(index))
    const requests: Parameters<SitemapJobPageFetcher>[0][] = []
    const controller = new AbortController()
    const fetchPage: SitemapJobPageFetcher = async (request) => {
      requests.push(request)
      return {
        rows: request.afterId === null ? rows.slice(0, 1000) : rows.slice(1000),
        error: null,
      }
    }

    await expect(
      fetchSitemapJobChunkRows(1, fetchPage, controller.signal),
    ).resolves.toEqual(rows)
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      ...sitemapJobIdRange(1),
      afterId: null,
      limit: 1000,
    })
    expect(requests[1]).toMatchObject({
      ...sitemapJobIdRange(1),
      afterId: rows[999].id,
      limit: 1000,
    })
    expect(requests[1].nowIso).toBe(requests[0].nowIso)
    expect(requests.every((request) => request.signal === controller.signal)).toBe(true)
  })

  it('fails the child when PostgREST reports an error', async () => {
    const fetchPage: SitemapJobPageFetcher = async () => ({
      rows: [],
      error: { message: 'database unavailable' },
    })

    await expect(fetchSitemapJobChunkRows(0, fetchPage)).rejects.toThrow(
      'sitemaps/jobs-0.xml query failed: database unavailable',
    )
  })

  it('rejects a non-advancing keyset cursor', async () => {
    const repeatedPage = Array.from({ length: 1000 }, () => sitemapJobRow(1))
    const fetchPage: SitemapJobPageFetcher = async () => ({
      rows: repeatedPage,
      error: null,
    })

    await expect(fetchSitemapJobChunkRows(0, fetchPage)).rejects.toThrow(
      'did not advance its UUID cursor',
    )
  })

  it('accepts exactly 50,000 rows after an empty overflow probe', async () => {
    let call = 0
    const fetchPage: SitemapJobPageFetcher = async (request) => {
      const page = call++
      if (request.limit === 1) return { rows: [], error: null }
      return {
        rows: Array.from(
          { length: request.limit },
          (_, index) => sitemapJobRow(page * 1000 + index),
        ),
        error: null,
      }
    }

    const rows = await fetchSitemapJobChunkRows(0, fetchPage)
    expect(rows).toHaveLength(50000)
    expect(call).toBe(51)
  })

  it('rejects a child with more than 50,000 rows', async () => {
    let call = 0
    const fetchPage: SitemapJobPageFetcher = async (request) => {
      const page = call++
      if (request.limit === 1) return { rows: [sitemapJobRow(50000)], error: null }
      return {
        rows: Array.from(
          { length: request.limit },
          (_, index) => sitemapJobRow(page * 1000 + index),
        ),
        error: null,
      }
    }

    await expect(fetchSitemapJobChunkRows(0, fetchPage)).rejects.toThrow(
      'reached the 50000-URL protocol limit',
    )
  })
})

describe('buildJobChunkSitemap', () => {
  it('renders only the injected child rows and de-duplicates slugs', async () => {
    const xml = await buildJobChunkSitemap(4, async (chunk) => {
      expect(chunk).toBe(4)
      return [
        sitemapJobRow(1, 'registered-nurse-tampa'),
        sitemapJobRow(2, 'registered-nurse-tampa'),
        sitemapJobRow(3, 'medical-assistant-orlando'),
      ]
    })

    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml.match(/registered-nurse-tampa/g)).toHaveLength(1)
    expect(xml).toContain('<loc>https://freejobpost.co/jobs/medical-assistant-orlando</loc>')
    expect(xml).toContain('<lastmod>2026-08-27T12:00:00.000Z</lastmod>')
  })

  it('throws on a runtime loader failure so ISR can retain the last good child', async () => {
    await expect(
      buildJobChunkSitemap(4, async () => {
        throw new Error('query failed')
      }),
    ).rejects.toThrow('query failed')
  })

  it('throws on an empty runtime child so ISR retains the last good XML', async () => {
    await expect(buildJobChunkSitemap(4, async () => [])).rejects.toThrow(
      '0 jobs fetched',
    )
  })

  it('passes request cancellation into the job-child loader', async () => {
    const requestController = new AbortController()
    const xml = await buildJobChunkSitemap(
      4,
      async (chunk, requestSignal) => {
        expect(chunk).toBe(4)
        expect(requestSignal).toBe(requestController.signal)
        return [sitemapJobRow(1, 'registered-nurse-tampa')]
      },
      requestController.signal,
    )

    expect(xml).toContain('/jobs/registered-nurse-tampa')
  })

  it('throws when nonempty rows produce no valid job URLs', async () => {
    await expect(
      buildJobChunkSitemap(4, async () => [sitemapJobRow(1, '')]),
    ).rejects.toThrow('0 valid job URLs after slug filtering')
  })

  it('uses the valid one-URL fallback at build time after slug filtering', async () => {
    const previousPhase = process.env.NEXT_PHASE
    process.env.NEXT_PHASE = 'phase-production-build'

    try {
      const xml = await buildJobChunkSitemap(4, async () => [sitemapJobRow(1, '')])
      expect(xml.match(/<url>/g)).toHaveLength(1)
      expect(xml).toContain('<loc>https://freejobpost.co/jobs</loc>')
    } finally {
      if (previousPhase === undefined) delete process.env.NEXT_PHASE
      else process.env.NEXT_PHASE = previousPhase
    }
  })
})

function pagesDependencies(
  overrides: Partial<PagesSitemapDependencies> = {},
): PagesSitemapDependencies {
  return {
    loadLatestJobUpdatedAt: async () => null,
    loadEmployers: async () => [],
    loadFederalMatrixCells: async () => [
      { agency: FEDERAL_AGENCIES[0], state: STATE_HUBS[0], count: 25 },
    ],
    loadMatrixCells: async () => [
      { specialty: SPECIALTY_HUBS[0], state: STATE_HUBS[0], count: 25 },
    ],
    loadCityMatrixCells: async () => [
      { city: CITY_HUBS[0], specialty: SPECIALTY_HUBS[0], count: 25 },
    ],
    loadHubCounts: async () => new Map(),
    ...overrides,
  }
}

describe('buildPagesSitemap', () => {
  it('loads the newest timestamp and employer directory independently', async () => {
    const xml = await buildPagesSitemap(
      pagesDependencies({
        loadLatestJobUpdatedAt: async () => '2026-08-27T13:00:00.000Z',
        loadEmployers: async () => [
          {
            slug: 'county-health',
            verified_via: 'manual',
            company_name: 'County Health',
            verified_at: '2026-08-27T10:00:00.000Z',
          },
        ],
      }),
    )

    expect(xml).toContain('<loc>https://freejobpost.co/</loc>')
    expect(xml).toContain('<lastmod>2026-08-27T13:00:00.000Z</lastmod>')
    expect(xml).toContain('<loc>https://freejobpost.co/employers/county-health</loc>')
  })

  it('passes request cancellation into every pages-child loader', async () => {
    const requestController = new AbortController()
    const seenSignals: Array<AbortSignal | undefined> = []
    const track = <T>(value: T) => async (requestSignal?: AbortSignal): Promise<T> => {
      seenSignals.push(requestSignal)
      return value
    }

    await buildPagesSitemap(
      pagesDependencies({
        loadLatestJobUpdatedAt: track(null),
        loadEmployers: track([]),
        loadFederalMatrixCells: track([
          { agency: FEDERAL_AGENCIES[0], state: STATE_HUBS[0], count: 25 },
        ]),
        loadMatrixCells: track([
          { specialty: SPECIALTY_HUBS[0], state: STATE_HUBS[0], count: 25 },
        ]),
        loadCityMatrixCells: track([
          { city: CITY_HUBS[0], specialty: SPECIALTY_HUBS[0], count: 25 },
        ]),
        loadHubCounts: track(new Map<string, number>()),
      }),
      requestController.signal,
    )

    expect(seenSignals).toHaveLength(6)
    expect(seenSignals.every((signal) => signal === requestController.signal)).toBe(true)
  })

  it('throws on runtime sitemap-defining loader failures after all loaders settle', async () => {
    let hubLoaderSettled = false
    const failure = new Error('employer directory offline')

    await expect(
      buildPagesSitemap(
        pagesDependencies({
          loadEmployers: async () => {
            throw failure
          },
          loadHubCounts: async () => {
            await Promise.resolve()
            hubLoaderSettled = true
            return new Map()
          },
        }),
      ),
    ).rejects.toBe(failure)
    expect(hubLoaderSettled).toBe(true)
  })

  it('throws on an empty required matrix so ISR retains the last good pages sitemap', async () => {
    await expect(
      buildPagesSitemap(
        pagesDependencies({
          loadFederalMatrixCells: async () => [],
        }),
      ),
    ).rejects.toThrow('federal matrix returned 0 rows')
  })

  it('keeps hub pagination counts optional at runtime', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const xml = await buildPagesSitemap(
        pagesDependencies({
          loadHubCounts: async () => {
            throw new Error('counts offline')
          },
        }),
      )

      expect(xml).toContain('<loc>https://freejobpost.co/</loc>')
      expect(xml).toContain('<loc>https://freejobpost.co/jobs</loc>')
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('uses the DB-independent fallback set during a production build', async () => {
    const previousPhase = process.env.NEXT_PHASE
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fail = async (): Promise<never> => {
      throw new Error('offline')
    }
    process.env.NEXT_PHASE = 'phase-production-build'

    try {
      const xml = await buildPagesSitemap(
        pagesDependencies({
          loadLatestJobUpdatedAt: fail,
          loadEmployers: fail,
          loadFederalMatrixCells: fail,
          loadMatrixCells: fail,
          loadCityMatrixCells: fail,
          loadHubCounts: fail,
        }),
      )

      expect(xml).toContain('<loc>https://freejobpost.co/</loc>')
      expect(xml).toContain('<loc>https://freejobpost.co/jobs</loc>')
      expect(xml).toContain('<loc>https://freejobpost.co/terms</loc>')
      expect(xml).not.toContain('<lastmod>')
      expect(errorSpy).toHaveBeenCalledTimes(6)
    } finally {
      if (previousPhase === undefined) delete process.env.NEXT_PHASE
      else process.env.NEXT_PHASE = previousPhase
      errorSpy.mockRestore()
    }
  })

  it('does not retain a build-only matrix fallback for a later runtime load', async () => {
    const previousPhase = process.env.NEXT_PHASE
    let attempts = 0
    const dependencies = pagesDependencies({
      loadMatrixCells: async () => {
        attempts++
        if (process.env.NEXT_PHASE === 'phase-production-build') {
          return []
        }
        return [{ specialty: SPECIALTY_HUBS[0], state: STATE_HUBS[0], count: 25 }]
      },
    })

    try {
      process.env.NEXT_PHASE = 'phase-production-build'
      const buildXml = await buildPagesSitemap(dependencies)
      expect(buildXml).not.toContain(
        `/specialty/${SPECIALTY_HUBS[0].slug}/${STATE_HUBS[0].slug}`,
      )

      if (previousPhase === undefined) delete process.env.NEXT_PHASE
      else process.env.NEXT_PHASE = previousPhase

      const runtimeXml = await buildPagesSitemap(dependencies)
      expect(runtimeXml).toContain(
        `/specialty/${SPECIALTY_HUBS[0].slug}/${STATE_HUBS[0].slug}`,
      )
      expect(attempts).toBe(2)
    } finally {
      if (previousPhase === undefined) delete process.env.NEXT_PHASE
      else process.env.NEXT_PHASE = previousPhase
    }
  })
})

describe('renderUrlset', () => {
  it('emits the sitemaps 0.9 urlset shape', () => {
    const xml = renderUrlset([
      {
        url: 'https://freejobpost.co/jobs/x',
        lastModified: '2026-08-19T16:23:01.870Z',
        changeFrequency: 'daily',
        priority: 0.7,
      },
    ])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://freejobpost.co/jobs/x</loc>')
    expect(xml).toContain('<lastmod>2026-08-19T16:23:01.870Z</lastmod>')
    expect(xml).toContain('<changefreq>daily</changefreq>')
    expect(xml).toContain('<priority>0.7</priority>')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('serializes a Date lastModified as ISO', () => {
    const xml = renderUrlset([
      { url: 'https://freejobpost.co/', lastModified: new Date('2026-08-19T00:00:00.000Z') },
    ])
    expect(xml).toContain('<lastmod>2026-08-19T00:00:00.000Z</lastmod>')
  })

  it('omits optional fields that were not supplied', () => {
    const xml = renderUrlset([{ url: 'https://freejobpost.co/terms' }])
    expect(xml).not.toContain('<lastmod>')
    expect(xml).not.toContain('<changefreq>')
    expect(xml).not.toContain('<priority>')
  })

  // Next's own serializer interpolates <loc> raw. A slug containing a bare `&`
  // would have produced invalid XML and made Google reject the entire file.
  it('escapes the loc', () => {
    const xml = renderUrlset([{ url: 'https://freejobpost.co/jobs/a&b<c' }])
    expect(xml).toContain('<loc>https://freejobpost.co/jobs/a&amp;b&lt;c</loc>')
  })

  it('keeps priority 0 (a falsy number) rather than dropping it', () => {
    expect(renderUrlset([{ url: 'https://x/', priority: 0 }])).toContain('<priority>0</priority>')
  })
})

describe('renderSitemapIndex', () => {
  it('emits the sitemapindex shape, not a urlset', () => {
    const xml = renderSitemapIndex([
      { url: 'https://freejobpost.co/sitemaps/jobs-0.xml', lastModified: '2026-08-19T16:23:01.870Z' },
    ])
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<sitemap>')
    expect(xml).toContain('<loc>https://freejobpost.co/sitemaps/jobs-0.xml</loc>')
    expect(xml).toContain('<lastmod>2026-08-19T16:23:01.870Z</lastmod>')
    expect(xml).not.toContain('<urlset')
    expect(xml).not.toContain('<url>')
  })

  // lastmod is optional in the sitemapindex schema. The production index omits
  // it so the discovery root never needs a database query.
  it('is valid with no lastmod at all', () => {
    const xml = renderSitemapIndex(SITEMAP_CHILDREN.map((c) => ({ url: sitemapChildUrl(c) })))
    expect(xml).not.toContain('<lastmod>')
    expect(xml.match(/<sitemap>/g)).toHaveLength(SITEMAP_CHILDREN.length)
  })

  it('keeps the production index database-independent and omits optional child lastmods', async () => {
    const xml = await buildSitemapIndex()
    expect(xml).not.toContain('<lastmod>')
    expect(xml.match(/<sitemap>/g)).toHaveLength(SITEMAP_CHILDREN.length)
    for (const child of SITEMAP_CHILDREN) {
      expect(xml).toContain(`<loc>${sitemapChildUrl(child)}</loc>`)
    }
  })

  it('stays tiny — this file is served on every crawl inside a 10ms CPU budget', () => {
    const xml = renderSitemapIndex(
      SITEMAP_CHILDREN.map((c) => ({ url: sitemapChildUrl(c), lastModified: '2026-08-19T16:23:01.870Z' })),
    )
    expect(Buffer.byteLength(xml)).toBeLessThan(4096)
  })
})
