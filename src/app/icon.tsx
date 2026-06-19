import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Ava Health favicon — navy square (#003D5C) with a lime underline
// (#7FBC00), matching the Ava Health brand. The single "A" monogram reads
// cleanly without ascenders/descenders fighting the tiny 32x32 canvas.
export default function Icon() {
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
          background: '#003D5C',
          fontFamily: '"Helvetica Neue", "Segoe UI", system-ui, sans-serif',
          fontWeight: 900,
          color: '#fff',
          fontSize: 22,
          letterSpacing: -1,
          borderBottom: '4px solid #7FBC00',
        }}
      >
        A
      </div>
    ),
    { ...size },
  )
}
