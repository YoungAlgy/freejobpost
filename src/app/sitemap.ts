import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { CAREER_PATHS } from '@/lib/career-paths'
import { computeViableCellsViaSql } from '@/lib/specialty-state-matrix'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'
import { FEDERAL_AGENCIES } from '@/lib/federal-agencies'
import { getViableFederalCellsCached } from '@/lib/federal-state-matrix'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://freejobpost.co'

  // Pull job inventory once, ordered by updated_at DESC. We use the first row's
  // updated_at as the lastmod signal for every route that aggregates the job
  // table (homepage, /jobs, hub indexes, individual state/specialty hubs).
  //
  // Why not `new Date()`? Google's sitemap docs are explicit: if `lastmod`
  // consistently lies (e.g. every URL shows "today" on every refresh), Google
  // stops trusting all `lastmod` values from the host. Tying hub freshness to
  // real underlying-data freshness keeps the signal honest.
  // Jobs: 12-batch range pattern (PostgREST anon caps a single .limit(>1000)
  // at 1,000 silently; with ~9,616 active jobs we'd ship a sitemap covering
  // only 11% of inventory without batching). Verified 2026-05-19 — pre-fix
  // sitemap had been missing ~8,000 URLs from Google's index for weeks.
  // Bumped from 9 → 12 on 2026-05-21 to match /jobs.xml + feed-builders;
  // keeps the sitemap ahead of inventory growth and avoids the 9-batch
  // ceiling that hit /jobs.xml on 2026-05-20.
  const SITEMAP_NUM_BATCHES = 12
  const SITEMAP_BATCH_SIZE = 1000
  const nowIso = new Date().toISOString()
  const baseJobs = () => supabase
    .from('public_jobs')
    .select('slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
  const jobsBatchPromises = Array.from({ length: SITEMAP_NUM_BATCHES }, (_, i) =>
    baseJobs().range(i * SITEMAP_BATCH_SIZE, (i + 1) * SITEMAP_BATCH_SIZE - 1)
  )
  const [employersRes, ...jobsBatches] = await Promise.all([
    // Employer pages — only verified non-seeded employers with at least 1 active job
    // (the page itself enforces the job-count gate, but pre-filtering here keeps
    // the sitemap clean and avoids surfacing empty 404-bound pages to crawlers)
    supabase
      .from('public_employers_directory')
      .select('slug, verified_via, company_name, verified_at')
      .not('verified_at', 'is', null),
    ...jobsBatchPromises,
  ])

  const jobsData = jobsBatches.flatMap(
    (b) => (b.data ?? []) as { slug: string; updated_at: string }[]
  )
  const maxJobUpdate = jobsData[0]?.updated_at
    ? new Date(jobsData[0].updated_at)
    : new Date()

  // /employer is intentionally excluded from the sitemap — it's auth-gated
  // (redirects to /employer/login when no session) and blocked by robots.txt.
  // /employers (plural) is the public employer directory — included below.
  //
  // Truly static routes (terms/privacy/post-job/pricing/how-it-works/for-employers)
  // omit `lastModified`. Their content rarely changes; emitting a moving timestamp
  // is the lie pattern we're avoiding.
  // Aggregator routes (/, /jobs, /specialty, /state, /employers) carry maxJobUpdate
  // because they all render slices of the job inventory.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/jobs`, lastModified: maxJobUpdate, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/jobs/federal`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/specialty`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/state`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/city`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/become`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/employers`, lastModified: maxJobUpdate, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/post-job`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/for-employers`, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/changelog`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/changelog/feed.xml`, changeFrequency: 'weekly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    // Federal-compliance disclosure page. Low priority (regulatory, not
    // commercial) but must be crawler-discoverable for E-Verify trust signal.
    { url: `${base}/e-verify`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Specialty hub pages — one per common healthcare specialty so each
  // ranks for "[specialty] jobs" queries. lastmod tied to job-data freshness.
  const specialtyRoutes: MetadataRoute.Sitemap = SPECIALTY_HUBS.map((s) => ({
    url: `${base}/specialty/${s.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Per-specialty RSS feeds — pre-filtered streams for niche aggregators
  // + RSS readers. Lower priority than the human-facing hub page.
  const specialtyFeedRoutes: MetadataRoute.Sitemap = SPECIALTY_HUBS.map((s) => ({
    url: `${base}/feeds/specialty/${s.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'hourly' as const,
    priority: 0.4,
  }))

  // State hub pages — one per top US state for healthcare-job density
  const stateRoutes: MetadataRoute.Sitemap = STATE_HUBS.map((s) => ({
    url: `${base}/state/${s.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Per-state RSS feeds — pre-filtered streams for state-specific
  // aggregators + RSS readers.
  const stateFeedRoutes: MetadataRoute.Sitemap = STATE_HUBS.map((s) => ({
    url: `${base}/feeds/state/${s.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'hourly' as const,
    priority: 0.4,
  }))

  // City hub pages — one per curated US healthcare metro. Closes the
  // gap between state hubs (broad) and per-job pages (narrow).
  const cityRoutes: MetadataRoute.Sitemap = CITY_HUBS.map((c) => ({
    url: `${base}/city/${c.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Career-path guides — long-form factual content targeting the
  // upstream "how to become a <role>" query family.
  const careerPathRoutes: MetadataRoute.Sitemap = CAREER_PATHS.map((p) => ({
    url: `${base}/become/${p.slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  // Federal-agency landing pages — one per FEDERAL_AGENCIES entry. The /jobs/
  // federal index is in staticRoutes above; this adds the per-agency leaves.
  const federalRoutes: MetadataRoute.Sitemap = FEDERAL_AGENCIES.map((a) => ({
    url: `${base}/jobs/federal/${a.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  // Federal agency × state matrix leaves — only cells with ≥5 active jobs
  // (same threshold the route's generateStaticParams enforces, so the sitemap
  // and the actually-renderable URLs stay in lockstep). At current inventory
  // this is ~50-80 URLs, dominated by VA × state combos.
  const federalMatrixCells = await getViableFederalCellsCached(supabase)
  const federalMatrixRoutes: MetadataRoute.Sitemap = federalMatrixCells.map((c) => ({
    url: `${base}/jobs/federal/${c.agency.slug}/${c.state.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.75,
  }))

  // Specialty × State matrix pages — only cells with ≥5 active matching jobs.
  // Uses the shared SQL-counted helper so the sitemap, generateStaticParams,
  // and the runtime renderable URLs stay in lockstep.
  const matrixCells = await computeViableCellsViaSql(supabase)
  const matrixRoutes: MetadataRoute.Sitemap = matrixCells.map((c) => ({
    url: `${base}/specialty/${c.specialty.slug}/${c.state.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.75,
  }))

  // City × Specialty matrix pages — same ≥5-job threshold. Higher
  // candidate intent than state×specialty (city queries carry more
  // explicit "where I want to work" signal). Caps at ~250-300 cells.
  const cityMatrixCells = await getViableCityCellsCached(supabase)
  const cityMatrixRoutes: MetadataRoute.Sitemap = cityMatrixCells.map((c) => ({
    url: `${base}/city/${c.city.slug}/${c.specialty.slug}`,
    lastModified: maxJobUpdate,
    changeFrequency: 'daily' as const,
    priority: 0.75,
  }))

  const jobRoutes: MetadataRoute.Sitemap = jobsData.map((j) => ({
    url: `${base}/jobs/${j.slug}`,
    lastModified: j.updated_at,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

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
        e.verified_via !== 'ats_import' &&
        !/^ava health partners\b/i.test(e.company_name)
    )
    .map((e) => ({
      url: `${base}/employers/${e.slug}`,
      lastModified: e.verified_at,
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    }))

  return [
    ...staticRoutes,
    ...specialtyRoutes,
    ...specialtyFeedRoutes,
    ...stateRoutes,
    ...stateFeedRoutes,
    ...cityRoutes,
    ...careerPathRoutes,
    ...federalRoutes,
    ...federalMatrixRoutes,
    ...matrixRoutes,
    ...cityMatrixRoutes,
    ...jobRoutes,
    ...employerRoutes,
  ]
}
