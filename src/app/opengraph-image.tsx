import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Free Job Post — Healthcare jobs without the Indeed tax'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
          borderTop: '12px solid #15803d',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: 28, fontWeight: 900 }}>
          <span style={{ display: 'flex' }}>
            <span>freejobpost</span>
            <span style={{ color: '#15803d' }}>.co</span>
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid #000',
              padding: '4px 8px',
              letterSpacing: 2,
            }}
          >
            BETA
          </span>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#15803d',
              textTransform: 'uppercase',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ width: 10, height: 10, background: '#15803d', display: 'flex' }} />
            <span>Free healthcare job board</span>
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: -2,
              color: '#000',
              marginBottom: 28,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Free healthcare</span>
            <span>job posts.</span>
          </div>
          <div
            style={{
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

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 22,
            fontWeight: 600,
            color: '#525252',
            borderTop: '2px solid #000',
            paddingTop: 24,
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
