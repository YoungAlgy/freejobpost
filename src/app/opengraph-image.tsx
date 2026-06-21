import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Free Healthcare Jobs. Post and Apply Free | Ava Health'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Mirrors freeresumepost OG structure exactly so we know Satori
// will render this. Keep nesting flat, every container display:flex,
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
            <span style={{ color: '#003D5C' }}>Ava Health</span>
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
              color: '#003D5C',
              textTransform: 'uppercase',
              marginBottom: 22,
            }}
          >
            Free healthcare job board
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2.5,
              color: '#003D5C',
              marginBottom: 12,
            }}
          >
            Free healthcare
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2.5,
              color: '#003D5C',
              marginBottom: 36,
            }}
          >
            job posts.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -1.5,
              color: '#7FBC00',
            }}
          >
            No auction fees.
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
          <span>Post jobs free · Apply free · No auction</span>
          <span style={{ color: '#003D5C', fontWeight: 800 }}>freejobpost.co</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
