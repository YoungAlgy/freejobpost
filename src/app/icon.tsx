import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// Brutalist favicon — solid black square with a thick green underline,
// matching the freejobpost.co brand accent (green-600 = #16a34a, the same
// --accent token the site uses). The two-letter stack reads as "fj" without
// ascenders/descenders fighting the tiny canvas.
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
          background: '#000',
          fontFamily: '"Helvetica Neue", "Segoe UI", system-ui, sans-serif',
          fontWeight: 900,
          color: '#fff',
          fontSize: 22,
          letterSpacing: -1,
          borderBottom: '4px solid #16a34a',
        }}
      >
        fj
      </div>
    ),
    { ...size },
  )
}
