import { ImageResponse } from 'next/og'

export const alt = 'Post nursing and allied health jobs free | FreeJobPost'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// 2026-08-13 audit: this route had no revalidate at all, unlike every
// sibling OG route in this app (jobs/[slug], specialty/[slug], state/[slug]
// all cache for 7 days) -- so every single request re-ran Satori rendering
// from scratch instead of serving a cached PNG. Confirmed live 500s on this
// route specifically while the cached per-job route stayed healthy under
// the same conditions. Content here is 100% static (no params, no DB
// query), so there's no correctness reason it wasn't cached -- this was a
// gap, not a deliberate choice.
export const revalidate = 604800

// Keep nesting flat, every container display:flex,
// avoid bare text nodes inside flex parents that have `gap`.
export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          padding: '70px',
          fontFamily: '"Inter", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
        }}
      >
        {/* Top brand bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: 28,
            fontWeight: 900,
          }}
        >
          <div style={{ display: 'flex' }}>
            <span style={{ color: '#17324D' }}>FreeJobPost</span>
          </div>
        </div>

        {/* Hero */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#17324D',
              textTransform: 'uppercase',
              marginBottom: 22,
            }}
          >
            Nursing and allied health
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2.5,
              color: '#17324D',
              marginBottom: 12,
            }}
          >
            Post healthcare
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2.5,
              color: '#17324D',
              marginBottom: 36,
            }}
          >
            jobs free.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -1.5,
              color: '#276749',
            }}
          >
            Simple from start to finish.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 20,
            color: '#525252',
            borderTop: '1px solid #e2e8f0',
            paddingTop: 22,
          }}
        >
          <span>Post · Verify · Receive applications</span>
          <span style={{ color: '#17324D', fontWeight: 800 }}>freejobpost.co</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
