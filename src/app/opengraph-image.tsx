import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Free Job Post — Healthcare jobs without the Indeed tax'
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
            <span>freejobpost</span>
            <span style={{ color: '#15803d' }}>.co</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid #000',
              padding: '4px 8px',
              letterSpacing: 2,
            }}
          >
            BETA
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
              color: '#15803d',
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
              color: '#000',
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
              color: '#000',
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
              color: '#15803d',
            }}
          >
            No Indeed tax.
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
            borderTop: '2px solid #000',
            paddingTop: 22,
          }}
        >
          <span>Post jobs free · Apply free · No auction</span>
          <span style={{ color: '#000', fontWeight: 800 }}>freejobpost.co</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
