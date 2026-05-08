import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://freejobpost.co'
  // Use the sitemap's own revalidate boundary as the lastModified marker
  // for static + hub routes. With revalidate=3600, Google sees the sitemap
  // refresh hourly, which matches the actual ISR cadence on /jobs and the
  // hub pages — gives crawlers an accurate freshness signal without
  // requiring per-page change tracking.
  const now = new Date()

  // /employer is intentionally excluded from the sitemap — it's auth-gated
  // (redirects to /employer/login when no session) and blocked by robots.txt.
  // Listing it would just confuse crawlers.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/specialty`, lastModified: now, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/state`, lastModified: now, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/post-job`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Specialty hub pages — one per common healthcare specialty so each
  // ranks for "[specialty] jobs" queries
  const specialtyRoutes: MetadataRoute.Sitemap = SPECIALTY_HUBS.map((s) => ({
    url: `${base}/specialty/${s.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // State hub pages — one per top US state for healthcare-job density
  const stateRoutes: MetadataRoute.Sitemap = STATE_HUBS.map((s) => ({
    url: `${base}/state/${s.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  const { data } = await supabase
    .from('public_jobs')
    .select('slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(5000)

  const jobRoutes: MetadataRoute.Sitemap = (data ?? []).map((j: { slug: string; updated_at: string }) => ({
    url: `${base}/jobs/${j.slug}`,
    lastModified: j.updated_at,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...specialtyRoutes, ...stateRoutes, ...jobRoutes]
}
