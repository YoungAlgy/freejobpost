import { ImageResponse } from 'next/og'

export const contentType = 'image/png'
// 2026-08-13 audit: same gap as app/opengraph-image.tsx -- 100% static
// content (no params, no DB query) with no revalidate, so it re-rendered
// via Satori on every single request instead of serving a cached PNG.
export const revalidate = 604800

// 512x512 PWA / maskable app icon for the independent FreeJobPost brand.
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FFFFFF',
        }}
      >
        <svg width="320" height="320" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="8" width="48" height="48" rx="12" fill="#17324D" />
          <rect x="17" y="19" width="24" height="4" rx="2" fill="#FFFFFF" />
          <rect x="17" y="29" width="18" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
          <rect x="17" y="39" width="13" height="4" rx="2" fill="#FFFFFF" opacity="0.75" />
          <circle cx="44" cy="43" r="10" fill="#276749" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M44 38v10M39 43h10" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
