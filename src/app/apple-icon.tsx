import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'
export const revalidate = 604800

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#FFFFFF',
        }}
      >
        <svg width="180" height="180" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect width="64" height="64" fill="#FFFFFF" />
          <rect x="8" y="8" width="48" height="48" rx="12" fill="#17324D" />
          <rect x="17" y="19" width="24" height="4" rx="2" fill="#FFFFFF" />
          <rect x="17" y="29" width="18" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
          <rect x="17" y="39" width="13" height="4" rx="2" fill="#FFFFFF" opacity="0.75" />
          <circle cx="44" cy="43" r="10" fill="#276749" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M44 38v10M39 43h10" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  )
}
