import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  trailingSlash: false,
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
        ],
      },
      {
        source: '/((?!_next|api).*)',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/employer/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
