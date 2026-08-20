import { describe, it, expect } from 'vitest'
import {
  HUB_PAGE_SIZE,
  hubPageHref,
  hubPageStaticParams,
  hubPageTitleSuffix,
  hubPaginationUrls,
  hubTotalPages,
  parseHubPageParam,
  sliceHubPage,
} from '@/lib/hub-pagination'
import { HUB_JOB_LIMITS } from '@/lib/hub-job-queries'

describe('HUB_PAGE_SIZE', () => {
  // Every hub route's `.limit(N)` is a multiple/superset of this, and the CPU
  // budget maths in the header comment assumes it. Changing it changes the
  // measured per-request CPU of the site's most valuable pages AND the number
  // of paginated URLs in pages.xml — so it should never move by accident.
  it('is 50', () => {
    expect(HUB_PAGE_SIZE).toBe(50)
  })

  // Every family cap divides evenly by the page size, so no hub ends on a
  // stub page holding a handful of jobs.
  it('divides every hub family cap evenly', () => {
    for (const cap of Object.values(HUB_JOB_LIMITS)) {
      expect(cap % HUB_PAGE_SIZE).toBe(0)
    }
  })
})

describe('hubTotalPages', () => {
  it('splits on exact multiples without emitting a trailing empty page', () => {
    expect(hubTotalPages(100, 100)).toBe(1)
    expect(hubTotalPages(200, 100)).toBe(2)
    expect(hubTotalPages(300, 100)).toBe(3)
  })

  it('rounds partial pages up', () => {
    expect(hubTotalPages(101, 100)).toBe(2)
    expect(hubTotalPages(199, 100)).toBe(2)
  })

  // An empty hub still renders a real "no active roles right now" page 1. It
  // must not report 0 pages, or the pagination nav and the sitemap would
  // disagree with what the route actually serves.
  it('never returns less than 1, even for an empty or nonsense corpus', () => {
    expect(hubTotalPages(0)).toBe(1)
    expect(hubTotalPages(-5)).toBe(1)
    expect(hubTotalPages(Number.NaN)).toBe(1)
    expect(hubTotalPages(100, 0)).toBe(1)
  })
})

describe('parseHubPageParam', () => {
  it('accepts canonical page numbers from 2 up', () => {
    expect(parseHubPageParam('2')).toBe(2)
    expect(parseHubPageParam('3')).toBe(3)
    // Regression guard: a `^[2-9]\d*$` shape would reject every page from 10 on.
    expect(parseHubPageParam('10')).toBe(10)
    expect(parseHubPageParam('17')).toBe(17)
    expect(parseHubPageParam('123')).toBe(123)
  })

  // The duplicate-content guard. /state/florida/p/1 would serve byte-identical
  // content to /state/florida, and /p/01, /p/001 … are an unbounded family of
  // the same. Page 1 has exactly one URL: the bare hub path.
  it('refuses page 1 in every spelling', () => {
    expect(parseHubPageParam('1')).toBeNull()
    expect(parseHubPageParam('01')).toBeNull()
    expect(parseHubPageParam('001')).toBeNull()
  })

  it('refuses non-canonical and non-numeric input', () => {
    expect(parseHubPageParam('')).toBeNull()
    expect(parseHubPageParam('0')).toBeNull()
    expect(parseHubPageParam('02')).toBeNull()
    expect(parseHubPageParam('-2')).toBeNull()
    expect(parseHubPageParam('2.0')).toBeNull()
    expect(parseHubPageParam(' 2')).toBeNull()
    expect(parseHubPageParam('2abc')).toBeNull()
    expect(parseHubPageParam('abc')).toBeNull()
    expect(parseHubPageParam('1e3')).toBeNull()
    expect(parseHubPageParam('٢')).toBeNull()
  })

  it('refuses integers past the safe range rather than returning a lossy number', () => {
    expect(parseHubPageParam('9007199254740993')).toBeNull()
  })
})

describe('hubPageHref', () => {
  // The already-indexed URL must not move. No redirect, no re-earned authority.
  it('leaves page 1 at the bare hub path', () => {
    expect(hubPageHref('/state/florida', 1)).toBe('/state/florida')
    expect(hubPageHref('/state/florida', 0)).toBe('/state/florida')
  })

  it('puts continuations under /p/<n>', () => {
    expect(hubPageHref('/state/florida', 2)).toBe('/state/florida/p/2')
    expect(hubPageHref('/jobs/federal/va', 10)).toBe('/jobs/federal/va/p/10')
  })

  it('round-trips with parseHubPageParam for every continuation page', () => {
    for (let p = 2; p <= 50; p++) {
      const href = hubPageHref('/state/florida', p)
      const parsed = parseHubPageParam(href.slice('/state/florida/p/'.length))
      expect(parsed).toBe(p)
    }
  })
})

describe('sliceHubPage', () => {
  const items = Array.from({ length: 250 }, (_, i) => i)

  it('returns the right window for each page', () => {
    expect(sliceHubPage(items, 1, 100)).toEqual(items.slice(0, 100))
    expect(sliceHubPage(items, 2, 100)).toEqual(items.slice(100, 200))
    expect(sliceHubPage(items, 3, 100)).toEqual(items.slice(200, 250))
  })

  it('returns empty past the end rather than throwing', () => {
    expect(sliceHubPage(items, 4, 100)).toEqual([])
    expect(sliceHubPage([], 1, 100)).toEqual([])
  })

  it('clamps junk page numbers to page 1 instead of returning garbage', () => {
    expect(sliceHubPage(items, 0, 100)).toEqual(items.slice(0, 100))
    expect(sliceHubPage(items, -3, 100)).toEqual(items.slice(0, 100))
    expect(sliceHubPage(items, Number.NaN, 100)).toEqual(items.slice(0, 100))
  })

  // The union of every page must be exactly the input, with nothing dropped and
  // nothing shown twice — that is the property that keeps pagination from
  // quietly hiding jobs from crawlers.
  it('partitions the corpus exactly across its pages', () => {
    for (const total of [0, 1, 99, 100, 101, 250, 300, 503]) {
      const corpus = Array.from({ length: total }, (_, i) => i)
      const pages = hubTotalPages(total, 100)
      const seen: number[] = []
      for (let p = 1; p <= pages; p++) seen.push(...sliceHubPage(corpus, p, 100))
      expect(seen).toEqual(corpus)
      expect(new Set(seen).size).toBe(total)
    }
  })
})

describe('hubPageStaticParams', () => {
  it('emits nothing when the hub fits on one page', () => {
    expect(hubPageStaticParams(0, 100)).toEqual([])
    expect(hubPageStaticParams(100, 100)).toEqual([])
  })

  it('emits pages 2..N as strings, never page 1', () => {
    expect(hubPageStaticParams(300, 100)).toEqual([{ page: '2' }, { page: '3' }])
    expect(hubPageStaticParams(101, 100)).toEqual([{ page: '2' }])
  })

  // Whatever generateStaticParams prerenders, the route's parser has to accept —
  // otherwise the build emits a page the handler then 404s.
  it('produces only params the route parser accepts', () => {
    for (const p of hubPageStaticParams(1000, 100)) {
      expect(parseHubPageParam(p.page)).toBe(Number(p.page))
    }
  })
})

describe('hubPaginationUrls', () => {
  it('is empty for a single-page hub so no phantom page 2 is advertised', () => {
    expect(hubPaginationUrls('/state/wyoming', 40, 100)).toEqual([])
    expect(hubPaginationUrls('/state/wyoming', 100, 100)).toEqual([])
    // …and at the real page size, where the threshold is lower.
    expect(hubPaginationUrls('/state/wyoming', HUB_PAGE_SIZE)).toEqual([])
  })

  it('lists every continuation URL', () => {
    expect(hubPaginationUrls('/state/texas', 300, 100)).toEqual([
      '/state/texas/p/2',
      '/state/texas/p/3',
    ])
  })

  // Guards the live configuration, not just the arithmetic: at HUB_PAGE_SIZE
  // against the real state cap, a maxed-out state hub must expose pages 2..6
  // and the sitemap must be able to name every one of them.
  it('covers a full state hub at the live page size', () => {
    const urls = hubPaginationUrls('/state/texas', HUB_JOB_LIMITS.state)
    expect(urls).toHaveLength(HUB_JOB_LIMITS.state / HUB_PAGE_SIZE - 1)
    expect(urls[0]).toBe('/state/texas/p/2')
    expect(urls[urls.length - 1]).toBe(
      `/state/texas/p/${HUB_JOB_LIMITS.state / HUB_PAGE_SIZE}`,
    )
  })

  // The sitemap must never advertise a URL generateStaticParams did not build.
  it('agrees exactly with hubPageStaticParams', () => {
    for (const total of [0, 1, 100, 101, 250, 300, 500, 503]) {
      const urls = hubPaginationUrls('/x', total, 100)
      const params = hubPageStaticParams(total, 100)
      expect(urls).toEqual(params.map((p) => `/x/p/${p.page}`))
    }
  })
})

describe('hubPageTitleSuffix', () => {
  // Page 1's <title> is the one that ranks. It must come back untouched.
  it('is empty on page 1', () => {
    expect(hubPageTitleSuffix(1, 3)).toBe('')
  })

  it('describes position for continuations', () => {
    expect(hubPageTitleSuffix(2, 3)).toBe(' | page 2 of 3')
  })
})
