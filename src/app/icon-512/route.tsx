import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'

// 512x512 PWA / maskable app icon = the Ava Health mark (navy medical cross +
// lime leaf) centered on white, inside the maskable safe zone so Android's
// circular/squircle mask doesn't clip it. Matches the tab favicon (app/icon.svg)
// and the apple-icon so every icon slot shows the same mark.
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
          <rect x="21" y="6" width="10" height="36" rx="2.5" fill="#003D5C" />
          <rect x="7" y="20" width="38" height="10" rx="2.5" fill="#003D5C" />
          <path d="M 34 22 C 50 22, 58 32, 58 45 C 58 56, 46 60, 34 57 C 27 51, 27 33, 34 22 Z" fill="#7FBC00" />
          <path d="M 36 27 Q 44 40, 47 55" stroke="#5C9900" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
