import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'

// 512x512 PWA / maskable app icon. Same Ava Health navy + lime "A" mark as
// /icon and /apple-icon, but the lime underline is inset (a centered bar, not
// a full-bleed bottom border) so the whole mark stays inside the maskable safe
// zone and isn't clipped by Android's circular / squircle mask. Referenced from
// manifest.ts. Uses the Ava Health navy (#003D5C) + lime (#7FBC00).
export function GET() {
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
        }}
      >
        <div
          style={{
            display: 'flex',
            fontWeight: 900,
            color: '#fff',
            fontSize: 300,
            letterSpacing: -14,
            lineHeight: 1,
          }}
        >
          A
        </div>
        <div
          style={{
            display: 'flex',
            width: 200,
            height: 28,
            background: '#7FBC00',
            marginTop: 24,
          }}
        />
      </div>
    ),
    { width: 512, height: 512 },
  )
}
