'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { normalizePartner } from '@/lib/partner-attribution'

/**
 * Outbound "Apply on employer site" link.
 *
 * Reads the ?ref=<partner> attribution param CLIENT-SIDE (from the URL the
 * visitor actually landed on) and routes the click through
 * /click/[slug]?p=<partner>, which logs per-partner attribution then 302s to
 * the real apply_url.
 *
 * WHY CLIENT-SIDE (2026-05-28 cost fix): /jobs/[slug] used to read
 * `searchParams` server-side to resolve `partner`. Reading searchParams is a
 * Next.js dynamic API, so it forced the ENTIRE 13.8K-page job surface into
 * dynamic rendering — every crawler hit (Googlebot + Bing + the 14 partner
 * feeds we publish, walking the surface continuously) re-rendered the page
 * with 3-6 DB queries, and `export const revalidate = 86400` was a complete
 * no-op (a dynamic route never enters the ISR cache). That was the dominant
 * Vercel-invocation cost. Moving the ?ref read here lets the page render as
 * static ISR again.
 *
 * Fallback semantics: before hydration (and for no-JS crawlers) the href is
 * ?p=internal — which is the correct default for non-partner traffic anyway,
 * and crawlers don't click "apply". Real partner-feed visitors get their
 * attribution resolved the instant the component hydrates.
 */
export default function ApplyExternalLink({
  slug,
  className,
  children,
}: {
  slug: string
  className?: string
  children: ReactNode
}) {
  const [href, setHref] = useState(`/click/${slug}?p=internal`)
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    setHref(`/click/${slug}?p=${encodeURIComponent(normalizePartner(ref))}`)
  }, [slug])
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  )
}
