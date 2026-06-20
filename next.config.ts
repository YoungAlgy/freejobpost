import type { NextConfig } from 'next'

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
  // Suppress the default `X-Powered-By: Next.js` response header. It's a
  // minor information leak — it tells attackers (and fingerprinting
  // services) exactly which framework + version-class we're on, which
  // narrows their CVE search. Standard hardening for production sites.
  poweredByHeader: false,
  async redirects() {
    return [
      {
        // 2026-05-13: /specialty/rn renamed to /specialty/registered-nurse.
        // Permanent 301 transfers any accrued authority on the old URL and
        // matches the slug used by the sister site (freeresumepost.co).
        source: '/specialty/rn',
        destination: '/specialty/registered-nurse',
        permanent: true,
      },
      {
        // Modern icons live at /icon (src/app/icon.tsx) and /apple-icon
        // (src/app/apple-icon.tsx) — Next.js auto-generates them with
        // versioned query strings. But many crawlers + older browsers
        // still hit /favicon.ico directly. Redirect to the canonical
        // generated icon instead of returning 404.
        source: '/favicon.ico',
        destination: '/icon',
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
      // ─── Ava Health family cross-links: vanity paths that don't exist on
      // this site route to the sibling tool, so the family reads as one
      // product. All target non-existent freejob paths → zero risk to real
      // pages. ───
      { source: '/resumes', destination: 'https://www.freeresumepost.co', permanent: true },
      { source: '/resume', destination: 'https://www.freeresumepost.co', permanent: true },
      { source: '/post-resume', destination: 'https://www.freeresumepost.co', permanent: true },
      { source: '/providers', destination: 'https://providers.avahealth.co', permanent: true },
      { source: '/find-providers', destination: 'https://providers.avahealth.co', permanent: true },
      { source: '/recruiters', destination: 'https://app.avahealth.co', permanent: true },
      { source: '/for-recruiters', destination: 'https://app.avahealth.co', permanent: true },
      { source: '/platform', destination: 'https://app.avahealth.co', permanent: true },
      { source: '/outreach', destination: 'https://app.avahealth.co/outreach', permanent: true },
      { source: '/beacon', destination: 'https://app.avahealth.co/outreach', permanent: true },
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
        // at the header level so a recruiter or auditor reading curl -I
        // sees the same signal as Google's bot reads from the meta tag.
        source: '/jobs/:slug/apply',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, follow' }],
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
