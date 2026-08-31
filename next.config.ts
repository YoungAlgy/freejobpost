import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  trailingSlash: false,
  // Build-time static generation can prerender the heavy partner-feed routes
  // (/feeds/*.xml) and the largest /specialty/[slug]/[state] hubs, each of which
  // pulls the full ~20K active-job corpus and serializes a multi-MB XML. As the
  // corpus + per-job payload grew (company_name + syndication_targets columns),
  // these crossed Next's DEFAULT 60s per-page static-generation timeout, failing
  // the production build after its 3 retries (2026-06-04). Raise the ceiling so
  // the slow-but-bounded feed prerenders complete. Additive + reversible; runtime
  // behavior is unchanged (feeds stay 6h ISR). If a feed ever needs >240s, that's
  // a real perf regression to investigate, not something to keep bumping.
  staticPageGenerationTimeout: 240,
  // 2026-08-26: default worker count (experimental.cpus, CPU-derived --
  // os.cpus().length - 1, 19 on this machine) x default
  // staticGenerationMaxConcurrency (8) allows up to ~150 concurrent page
  // generations, each firing its own Supabase requests. Confirmed via build log
  // ("Timed out acquiring connection from connection pool") that this
  // regularly outruns the Nano-tier project's connection pooler -- pages don't
  // fail because Postgres is slow (a direct query during the same failure
  // window returned in 159ms), they fail because so many builder workers are
  // queued waiting for a pool slot that individual pages blow past the 240s
  // ceiling above before ever reaching the database.
  //
  // staticGenerationMaxConcurrency/MinPagesPerWorker alone (first attempt)
  // did NOT fix this -- they only govern the LATER "Generating static pages"
  // phase. The build was actually failing in the EARLIER "Collecting page
  // data" phase (generateStaticParams + initial data fetches), which reads
  // `experimental.cpus` directly (see next/dist/build/index.js
  // getNumberOfWorkers) and ignores the staticGeneration* options entirely.
  // Capping cpus here is what actually bounds worker count in both phases.
  experimental: {
    cpus: 3,
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 150,
  },
  // Suppress the default `X-Powered-By: Next.js` response header. It's a
  // minor information leak — it tells attackers (and fingerprinting
  // services) exactly which framework + version-class we're on, which
  // narrows their CVE search. Standard hardening for production sites.
  poweredByHeader: false,
  async redirects() {
    return [
      {
        // Keep every indexed URL on the apex host used by metadata, sitemaps,
        // feeds, and structured data. Query parameters pass through.
        source: '/:path*',
        has: [{ type: 'host', value: 'www.freejobpost.co' }],
        destination: 'https://freejobpost.co/:path*',
        permanent: true,
      },
      {
        // 2026-05-13: /specialty/rn renamed to /specialty/registered-nurse.
        // Permanent 301 transfers any accrued authority on the old URL and
        // matches the canonical role name used throughout this product.
        source: '/specialty/rn',
        destination: '/specialty/registered-nurse',
        permanent: true,
      },
      {
        // Next serves src/app/icon.svg at /icon.svg. Older browsers still hit
        // /favicon.ico directly, so keep that request on the real SVG route.
        source: '/favicon.ico',
        destination: '/icon.svg',
        permanent: true,
      },
      {
        // Common typo / miswired backlink: /job/<slug> (singular) instead
        // of /jobs/<slug>. 301 preserves any link equity that accidentally
        // built up against the wrong path.
        source: '/job/:slug',
        destination: '/jobs/:slug',
        permanent: true,
      },
      {
        // /cities/* → /city/* — singular form is the canonical convention
        // on this site (matches /state, /specialty). Catches the obvious
        // alternate guess + protects against future content drift.
        source: '/cities',
        destination: '/city',
        permanent: true,
      },
      {
        source: '/cities/:slug*',
        destination: '/city/:slug*',
        permanent: true,
      },
      {
        source: '/states',
        destination: '/state',
        permanent: true,
      },
      {
        source: '/states/:slug*',
        destination: '/state/:slug*',
        permanent: true,
      },
      {
        source: '/specialties',
        destination: '/specialty',
        permanent: true,
      },
      {
        source: '/specialties/:slug*',
        destination: '/specialty/:slug*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        // Hardening — applied to every route. HSTS is set by Vercel.
        // Skips _next/* (static) and api/* (handled by route handlers).
        source: '/((?!_next/static|_next/image|api).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // challenges.cloudflare.com hosts the Turnstile bot-challenge widget script
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              // challenges.cloudflare.com is also used for the siteverify XHR + the iframe
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
              "frame-src https://challenges.cloudflare.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // NOTE (2026-06 audit): the old catch-all `X-Robots-Tag: index, follow`
      // header was REMOVED. index,follow is the crawler default, so the header
      // added nothing — but it shipped on every DYNAMICALLY noindexed page
      // (closed jobs, thin matrix cells set noindex via page metadata at
      // runtime, which a static header rule can't know about), sending Google
      // conflicting signals. Explicit noindex headers below stay.
      {
        // Apply pages are noindex via their page-level metadata. Mirror it
        // at the header level so an employer or auditor reading curl -I
        // sees the same signal as Google's bot reads from the meta tag.
        source: '/jobs/:slug/apply',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
      },
      {
        // E-Verify describes the legal operator's own hiring compliance. Keep
        // it reachable for reference without making it part of this product's
        // indexed search surface.
        source: '/e-verify',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/employer/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // /admin/* is internal-only (e.g. /admin/attribution dashboard,
        // gated by ADMIN_DASHBOARD_KEY env var). Never indexable.
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // /post-job/verify/<token> is a one-shot consume path — the page
        // itself sets robots:noindex,nofollow in its metadata. Headers
        // should agree.
        source: '/post-job/verify/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // /click/<slug> is a 302-redirect endpoint — not a content URL.
        // Already in robots.txt Disallow list; header reinforces.
        source: '/click/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
