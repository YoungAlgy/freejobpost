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
    // Sitemap points to both the human-facing sitemap and the job-feed XML.
    // Indeed / Google for Jobs / ZipRecruiter will follow /jobs.xml for the
    // structured inventory; /sitemap.xml covers the rest (landing, detail
    // pages). Both URLs listed so either crawler type finds the right one.
    sitemap: [
      'https://freejobpost.co/sitemap.xml',
      'https://freejobpost.co/jobs.xml',
    ],
    host: 'https://freejobpost.co',
  }
}
