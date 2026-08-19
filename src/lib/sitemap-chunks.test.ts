import { describe, it, expect } from 'vitest'
import {
  JOB_SITEMAP_CHUNKS,
  PAGES_SITEMAP_CHILD,
  SITEMAP_BASE,
  SITEMAP_CHILDREN,
  SITEMAP_REVALIDATE,
  parseSitemapChild,
  renderSitemapIndex,
  renderUrlset,
  sitemapChildUrl,
  sitemapChunkForSlug,
} from '@/lib/sitemap-chunks'

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

describe('sitemapChunkForSlug', () => {
  const slugs = Array.from(
    { length: 20000 },
    (_, i) => `registered-nurse-icu-${i}-tampa-fl-wd-RQ${i * 7919}`,
  )

  // If this ever returned NaN, a negative, or a value >= the chunk count, the
  // affected jobs would silently vanish from every sitemap — the exact failure
  // mode (silent under-coverage) that cost this site ~8,000 indexed URLs in
  // 2026-05 and ~2.6K again in 2026-05-28.
  it('always lands in [0, JOB_SITEMAP_CHUNKS)', () => {
    for (const slug of slugs) {
      const c = sitemapChunkForSlug(slug)
      expect(Number.isInteger(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(JOB_SITEMAP_CHUNKS)
    }
  })

  it('is deterministic', () => {
    for (const slug of slugs.slice(0, 200)) {
      expect(sitemapChunkForSlug(slug)).toBe(sitemapChunkForSlug(slug))
    }
  })

  it('partitions: every slug lands in exactly one chunk and none are lost', () => {
    const counts = new Array(JOB_SITEMAP_CHUNKS).fill(0)
    for (const slug of slugs) counts[sitemapChunkForSlug(slug)]++
    expect(counts.reduce((a, b) => a + b, 0)).toBe(slugs.length)
  })

  // Even distribution is what keeps every child sitemap inside the CPU budget.
  // A badly-skewed hash would put a disproportionate share into one chunk and
  // re-create the oversized-body problem for that one file.
  it('distributes within 25% of even', () => {
    const counts = new Array(JOB_SITEMAP_CHUNKS).fill(0)
    for (const slug of slugs) counts[sitemapChunkForSlug(slug)]++
    const expected = slugs.length / JOB_SITEMAP_CHUNKS
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.75)
      expect(c).toBeLessThan(expected * 1.25)
    }
  })

  it('handles empty and unicode slugs without throwing', () => {
    for (const s of ['', 'a', 'ünïcodé-slug', '中文-slug', '-'.repeat(500)]) {
      const c = sitemapChunkForSlug(s)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(JOB_SITEMAP_CHUNKS)
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

  // lastmod is optional in the sitemapindex schema — this is the fail-soft path
  // when the job fetch comes back empty. The index must still list every child.
  it('is valid with no lastmod at all', () => {
    const xml = renderSitemapIndex(SITEMAP_CHILDREN.map((c) => ({ url: sitemapChildUrl(c) })))
    expect(xml).not.toContain('<lastmod>')
    expect(xml.match(/<sitemap>/g)).toHaveLength(SITEMAP_CHILDREN.length)
  })

  it('stays tiny — this file is served on every crawl inside a 10ms CPU budget', () => {
    const xml = renderSitemapIndex(
      SITEMAP_CHILDREN.map((c) => ({ url: sitemapChildUrl(c), lastModified: '2026-08-19T16:23:01.870Z' })),
    )
    expect(Buffer.byteLength(xml)).toBeLessThan(4096)
  })
})
