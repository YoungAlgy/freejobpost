import type { MetadataRoute } from 'next'
import { SITEMAP_BASE, SITEMAP_CHILDREN, sitemapChildUrl } from '@/lib/sitemap-chunks'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Don't index:
        //   /employer/*               recruiter auth + dashboard (private)
        //   /admin/*                  internal attribution dashboard (key-gated)
        //   /api/*                    defensive; no /api routes today but
        //                             reserves future route handlers from
        //                             accidentally getting crawled
        //   /post-job/verify*         multi-step form intermediate state
        //   /jobs/*/apply              application form — the success state
        //                              is inline in the form (no separate
        //                              /apply/success route), so we just
        //                              block the form path. Page also sets
        //                              robots:noindex in its metadata and
        //                              X-Robots-Tag:noindex in next.config.
        //   /click/*                  click-tracking redirect endpoint —
        //                             no SEO value, every URL is just a
        //                             302 to the employer ATS, indexing
        //                             would waste crawl budget
        // /jobs.xml is the aggregator feed — let all UAs fetch it.
        disallow: [
          '/employer/',
          '/admin/',
          '/api/',
          '/post-job/verify',
          '/jobs/*/apply',
          '/click/',
        ],
      },
    ],
    // Sitemap: ONLY real XML sitemaps go here.
    //
    // /sitemap.xml is now a <sitemapindex> rather than one giant <urlset> — the
    // single 6.8MB response could not be served inside Workers' 10ms free-plan
    // CPU budget and was returning 503 exceededCpu on every request (see
    // src/lib/sitemap-chunks.ts for the full writeup and measurements). The
    // index alone is enough for Google and Bing, which both follow it, but every
    // child is listed explicitly too: a Sitemap: line is the one discovery path
    // that does not depend on the index being fetched and parsed successfully,
    // and it costs ~1.1KB of a file nothing paginates.
    //
    // Built from the shared SITEMAP_CHILDREN constant, so this list cannot drift
    // from what generateStaticParams actually generates. Note this stays a pure
    // in-memory string build with NO database access — /robots.txt measured 7-9ms
    // CPU on prod (that was the fixed cost of entering the Next.js server, since
    // fixed by enableCacheInterception), and it has no budget to spare for I/O.
    //
    // /jobs.xml is deliberately NOT listed: it's an Indeed-format syndication
    // FEED (<source><job>…), not a <urlset> sitemap. Aggregators (Indeed,
    // ZipRecruiter, etc.) are pointed at it via direct publisher-feed config,
    // never via a robots Sitemap: line — and Google for Jobs reads the
    // JobPosting schema on the detail pages, not this feed. Listing it here
    // only made GSC try to parse a job feed as a sitemap and log a read error.
    // The feed stays fully fetchable for aggregators via the allow: '/' above.
    sitemap: [
      `${SITEMAP_BASE}/sitemap.xml`,
      ...SITEMAP_CHILDREN.map(sitemapChildUrl),
    ],
    host: SITEMAP_BASE,
  }
}
