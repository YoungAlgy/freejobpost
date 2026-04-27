import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// iOS home-screen icon — same brutalist black + green stripe but with
// a more readable two-letter mark since the canvas is 5.6x larger.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          fontFamily: '"Helvetica Neue", "Segoe UI", system-ui, sans-serif',
          fontWeight: 900,
          color: '#fff',
          fontSize: 110,
          letterSpacing: -5,
          borderBottom: '20px solid #15803d',
        }}
      >
        fj
      </div>
    ),
    { ...size },
  )
}
