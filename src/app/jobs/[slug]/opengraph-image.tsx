// Per-job OG image. Each posting now gets a unique social card with the
// title + city/state + salary range + employment type baked in. Way more
// shareable than a generic "freejobpost.co" banner — recruiters posting
// jobs to LinkedIn/Twitter get a card that actually advertises the role.
//
// Generated on-demand and CDN-cached at the slug level (matches page's
// revalidate=600). Next.js 16 auto-discovers opengraph-image.tsx and
// registers it as og:image + twitter:image.

import { ImageResponse } from 'next/og'
import { supabase } from '@/lib/supabase'
import { formatSalary, employmentLabel, locationLabel } from '@/lib/public-jobs'

export const runtime = 'edge'
export const alt = 'Job posting on freejobpost.co'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// 2026-05-28 cost audit: the route's header comment claimed slug-level CDN
// caching but there was no revalidate, so each scraper/crawler fetch
// re-ran a Supabase query + re-rendered the PNG on the edge — across 13.8K
// jobs. OG content is static per job (title/location/salary baked in once),
// so cache for 7 days. Repeat unfurls (LinkedIn/Twitter/Slack) + crawler
// og:image fetches now serve from cache. Self-heals on the rare edit.
export const revalidate = 604800
// Only the columns the card renders — dropping the full description from
// the select (JOB_DETAIL_FIELDS pulled it) shrinks the per-miss query.
const OG_FIELDS = 'title, city, state, salary_min, salary_max, employment_type, specialty'

const BRAND = '#003D5C'
const ACCENT = '#7FBC00'
// Allow uppercase chars in slugs — Workday + Greenhouse external IDs
// (e.g. RQ4052378, JR192702) keep uppercase, and buildAtsSlug() carries
// them through to the slug. The page route's SLUG_RE was loosened on
// 2026-05-19 to fix ~3,400 active jobs returning 404; the OG image
// generator was missed in that pass. Without this, social-share embeds
// for Workday/Greenhouse jobs fall back to a generic "Healthcare role"
// card instead of the job-specific one. See
// src/app/jobs/[slug]/page.tsx SLUG_RE for the canonical pattern.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,120}$/

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Tight slug guard — same shape as the page route. Garbage URLs get a
  // generic card instead of a Supabase round-trip.
  let title = 'Healthcare role'
  let location = ''
  let salary = ''
  let employment = ''
  let specialty = ''

  if (SLUG_RE.test(slug)) {
    const { data } = await supabase
      .from('public_jobs')
      .select(OG_FIELDS)
      .eq('slug', slug)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()

    if (data) {
      title = data.title || title
      location = locationLabel({ city: data.city, state: data.state })
      salary = formatSalary(data.salary_min, data.salary_max) || ''
      employment = employmentLabel(data.employment_type) || ''
      specialty = data.specialty || ''
    }
  }

  const eyebrow = [specialty, employment].filter(Boolean).join(' · ').toUpperCase() || 'JOB POSTING'

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 20, borderBottom: `4px solid ${ACCENT}`, marginBottom: 48 }}>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>freejobpost</span>
          <span style={{ fontSize: 28, fontWeight: 400, opacity: 0.7 }}>.co</span>
        </div>

        <div style={{ display: 'flex', alignSelf: 'flex-start', background: ACCENT, color: BRAND, padding: '8px 18px', borderRadius: 999, fontSize: 20, fontWeight: 700, marginBottom: 32, letterSpacing: 1, maxWidth: 1040, overflow: 'hidden' }}>
          {eyebrow.slice(0, 80)}
        </div>

        <div style={{ display: 'flex', fontSize: 60, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1, maxHeight: 260, overflow: 'hidden' }}>
          {title}
        </div>

        {location ? (
          <div style={{ display: 'flex', fontSize: 32, fontWeight: 500, marginTop: 18, opacity: 0.95 }}>
            📍 {location}
          </div>
        ) : null}

        {salary ? (
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 400, marginTop: 12, opacity: 0.85 }}>
            {salary}
          </div>
        ) : null}

        <div style={{ position: 'absolute', bottom: 80, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 22, opacity: 0.85 }}>
          <span>freejobpost.co</span>
          <span>Free healthcare job board</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
