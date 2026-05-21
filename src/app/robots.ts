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
        //   /jobs/*/apply/success     post-apply success page (one-time view)
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
          '/jobs/*/apply/success',
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
