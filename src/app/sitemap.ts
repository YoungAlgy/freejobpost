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
  // /employers (plural) is the public employer directory — included below.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/specialty`, lastModified: now, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/state`, lastModified: now, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/post-job`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/for-employers`, lastModified: now, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/employers`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
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

  const [jobsRes, employersRes] = await Promise.all([
    supabase
      .from('public_jobs')
      .select('slug, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
      .limit(5000),
    // Employer pages — only verified non-seeded employers with at least 1 active job
    // (the page itself enforces the job-count gate, but pre-filtering here keeps
    // the sitemap clean and avoids surfacing empty 404-bound pages to crawlers)
    supabase
      .from('public_employers_directory')
      .select('slug, verified_via, company_name, verified_at')
      .not('verified_at', 'is', null),
  ])

  const jobRoutes: MetadataRoute.Sitemap = (jobsRes.data ?? []).map(
    (j: { slug: string; updated_at: string }) => ({
      url: `${base}/jobs/${j.slug}`,
      lastModified: j.updated_at,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })
  )

  type EmpSitemapRow = {
    slug: string
    verified_via: string | null
    company_name: string
    verified_at: string
  }
  const employerRoutes: MetadataRoute.Sitemap = (
    (employersRes.data ?? []) as EmpSitemapRow[]
  )
    .filter(
      (e) =>
        e.slug &&
        e.verified_via !== 'seeded' &&
        !/^ava health partners\b/i.test(e.company_name)
    )
    .map((e) => ({
      url: `${base}/employers/${e.slug}`,
      lastModified: e.verified_at,
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    }))

  return [...staticRoutes, ...specialtyRoutes, ...stateRoutes, ...jobRoutes, ...employerRoutes]
}
