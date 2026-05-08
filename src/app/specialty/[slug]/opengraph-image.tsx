// Per-specialty hub OG image. /specialty/[slug] aggregates all jobs in a
// given specialty (cardiology, ortho, hospitalist, etc.). Each gets its
// own social card so a Twitter share for "Cardiology Jobs" links visually
// to the specialty rather than a generic site banner.

import { ImageResponse } from 'next/og'
import { getSpecialtyHub } from '@/lib/specialty-slugs'

export const runtime = 'edge'
export const alt = 'Healthcare jobs by specialty'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = '#003D5C'
const ACCENT = '#7FBC00'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const hub = getSpecialtyHub(slug)
  const title = hub?.title || 'Healthcare jobs'

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(135deg, ${BRAND} 0%, #002a40 100%)`,
          padding: 80,
          color: 'white',
          fontFamily: '"Inter", system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 20, borderBottom: `4px solid ${ACCENT}`, marginBottom: 64 }}>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>freejobpost</span>
          <span style={{ fontSize: 28, fontWeight: 400, opacity: 0.7 }}>.co</span>
        </div>

        <div style={{ display: 'flex', alignSelf: 'flex-start', background: ACCENT, color: BRAND, padding: '8px 18px', borderRadius: 999, fontSize: 22, fontWeight: 700, marginBottom: 36, textTransform: 'uppercase', letterSpacing: 1 }}>
          Specialty hub
        </div>

        <div style={{ display: 'flex', fontSize: 88, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxHeight: 280, overflow: 'hidden' }}>
          {title}
        </div>

        <div style={{ display: 'flex', fontSize: 32, fontWeight: 400, marginTop: 18, opacity: 0.9, lineHeight: 1.2 }}>
          Free postings · all 50 states · direct apply
        </div>

        <div style={{ position: 'absolute', bottom: 80, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 24, opacity: 0.85 }}>
          <span>freejobpost.co/specialty/{slug}</span>
          <span>Free healthcare job board</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
