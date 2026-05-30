import type { MetadataRoute } from 'next'

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
    // Sitemap: ONLY the real XML sitemap goes here. /sitemap.xml is a proper
    // <urlset> (17K+ URLs incl every /jobs/<slug>), so Google discovers all job
    // detail pages — and their JobPosting structured data — straight from it.
    //
    // /jobs.xml is deliberately NOT listed: it's an Indeed-format syndication
    // FEED (<source><job>…), not a <urlset> sitemap. Aggregators (Indeed,
    // ZipRecruiter, etc.) are pointed at it via direct publisher-feed config,
    // never via a robots Sitemap: line — and Google for Jobs reads the
    // JobPosting schema on the detail pages, not this feed. Listing it here
    // only made GSC try to parse a job feed as a sitemap and log a read error.
    // The feed stays fully fetchable for aggregators via the allow: '/' above.
    sitemap: 'https://freejobpost.co/sitemap.xml',
    host: 'https://freejobpost.co',
  }
}
