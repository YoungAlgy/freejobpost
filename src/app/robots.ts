import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Don't index multi-step form intermediate states or employer auth paths
        disallow: ['/employer/', '/api/', '/post-job/verify', '/jobs/*/apply/success'],
      },
    ],
    sitemap: 'https://freejobpost.co/sitemap.xml',
    host: 'https://freejobpost.co',
  }
}
