import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Don't index multi-step form intermediate states or employer auth paths.
        // /jobs.xml is the aggregator feed — let all UAs fetch it.
        disallow: ['/employer/', '/api/', '/post-job/verify', '/jobs/*/apply/success'],
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
