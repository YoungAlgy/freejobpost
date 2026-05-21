import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  trailingSlash: false,
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
      {
        // Catch-all X-Robots-Tag for public pages. Explicitly excludes
        // private surfaces (/employer/* recruiter dashboard, /admin/*
        // internal-only attribution dashboard) and Next.js internals.
        // Without these exclusions, the private rules below would emit a
        // SECOND conflicting X-Robots-Tag header — Next.js merges headers
        // from multiple matching rules, so duplicates with opposing values
        // would ship to crawlers (the meta-robots noindex would still
        // protect us, but conflicting signals look broken to humans
        // auditing the site).
        source: '/((?!_next|api|employer|admin).*)',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
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
    ]
  },
}

export default nextConfig
