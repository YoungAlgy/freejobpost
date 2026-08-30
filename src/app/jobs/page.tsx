import { Suspense } from 'react'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  PUBLIC_EMPLOYER_JOB_SOURCE,
  PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN,
  type PublicJob,
} from '@/lib/public-jobs'
import JobsFilter from './jobs-filter'

import { safeJsonLd } from '@/lib/safe-jsonld'
export const metadata: Metadata = {
  title: 'Nursing and allied health jobs',
  description:
    'Browse nursing and allied health jobs posted directly by employers. Apply free with no account required.',
  alternates: { canonical: 'https://freejobpost.co/jobs' },
  openGraph: {
    title: 'Nursing and allied health jobs | freejobpost.co',
    description: 'Direct employer posts for nursing and allied health roles.',
    url: 'https://freejobpost.co/jobs',
    type: 'website',
    // Falls back to the root /opengraph-image generator. Every other major
    // hub page (/, /specialty/[slug], /state/[slug]) sets its og:image
    // explicitly via a sibling opengraph-image.tsx file — /jobs intentionally
    // reuses the homepage card since the page itself is a generic
    // "all healthcare jobs" listing without a specialty/state hook.
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nursing and allied health jobs | freejobpost.co',
    description: 'Direct employer posts for nursing and allied health roles.',
    images: ['/opengraph-image'],
  },
}

// 2026-05-28 cost pass: 300s → 1h, then → 4h. This is the heaviest page
// (12×1000-row query + ~5.5MB render per regen); the homepage stays 1h for
// "latest jobs" freshness, so /jobs can align to the 4h ingest cron without
// hurting discovery. See jobs/[slug] for the broader ISR-cost rationale.
export const revalidate = 21600

export default async function JobsIndexPage() {
  // 2026-05-28 payload refactor. This page used to fetch the ENTIRE active
  // corpus (12 × 1,000-row batches ≈ 12K jobs) and hand it all to JobsFilter
  // for in-memory filtering — ~5.5MB / 803KB gzip on every visit, of which
  // only 50 cards ever rendered. Now the page is a slim ISR-static shell that
  // ships just the first 50 jobs; all subsequent filtering + "show more" hits
  // /api/jobs/search, which is only invoked on real human interaction (bots
  // crawl the cached shell and never touch the filter UI). See that route +
  // jobs-filter.tsx for the client side.
  const INITIAL_PAGE_SIZE = 50
  // role/state are low-cardinality (~dozens of roles, ≤51 states), so a single
  // 1,000-row sample of the newest jobs contains every distinct value in
  // practice — enough to populate the dropdowns without re-fetching the corpus.
  // Anything rarer than that is still reachable via the (server-side) search box.
  const OPTIONS_SAMPLE = 1000
  const nowIso = hourIso()

  const [initialRes, optionsRes, countRes, verifiedRes] = await Promise.all([
    // First page of jobs — SSR'd for SEO + instant paint. updated_at DESC so
    // Recently updated direct posts appear first.
    supabase
      .from('public_jobs')
      .select(JOB_LIST_FIELDS)
      .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .range(0, INITIAL_PAGE_SIZE - 1),
    // role + state only → derive the filter dropdown options.
    supabase
      .from('public_jobs')
      .select('role, state')
      .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .range(0, OPTIONS_SAMPLE - 1),
    // Honest total for the "OPEN ROLES" badge — decoupled from how many we render.
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso),
    // Verified employer pool → the "VERIFIED ONLY" pill + per-card ✓.
    // Exclude seeded Ava inventory + ATS imports — "verified" should only mean
    // a real third-party employer confirmed via domain email. Seeded jobs are
    // cold-start placeholders; ATS imports are Greenhouse/Lever public-feed
    // pulls with no employer relationship. company_name guard is defence-in-
    // depth in case verified_via gets reset (S7 honesty).
    supabase
      .from('public_employers_directory')
      .select('id')
      .not('verified_at', 'is', null)
      .not('verified_via', 'in', '(seeded,ats_import)')
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN),
  ])

  const initialJobs: PublicJob[] = (initialRes.data ?? []) as PublicJob[]

  // Fail closed on query errors so an infrastructure failure never gets cached
  // as an empty board. Zero direct employer posts is a valid early-stage state.
  // Throwing makes Next serve the last-good ISR cache (stale-while-revalidate);
  // a cold cache 500s, which a crawler retries — vs trusting a 200 "no jobs" and
  // treating the site as dead. Build-phase guarded (NEXT_PHASE) so a DB hiccup
  // during prerender degrades to an empty shell that self-heals on the next
  // runtime revalidate instead of failing the deploy. Mirrors /jobs.xml.
  if (
    initialRes.error &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    throw new Error(
      `/jobs: initial fetch failed (error=${initialRes.error?.message ?? 'none'}, ` +
        `rows=${initialJobs.length}) — refusing to cache an empty board.`,
    )
  }

  const totalActive: number = countRes.count ?? initialJobs.length
  const verifiedEmployerIds: string[] = (
    (verifiedRes.data ?? []) as Array<{ id: string }>
  ).map((row) => row.id)

  const optionRows = (optionsRes.data ?? []) as Array<{
    role: string | null
    state: string | null
  }>
  const roles = Array.from(
    new Set(optionRows.map((j) => j.role?.trim()).filter((r): r is string => !!r))
  ).sort()
  const states = Array.from(
    new Set(optionRows.map((j) => j.state?.trim()).filter((s): s is string => !!s))
  ).sort()

  // NOTE: JobPosting JSON-LD is intentionally NOT emitted here.
  // Each individual /jobs/[slug] page emits accurate per-job JSON-LD with
  // the correct hiringOrganization pulled from the DB. Emitting JobPosting
  // JSON-LD on this listing page with a hardcoded org ('freejobpost.co' is
  // a job board, not a hiring organization) would fail Google's Rich Results
  // validation and misattribute real-employer roles.

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
    ],
  }

  // ItemList JSON-LD — signals to Google that this page IS a list of
  // related jobs (vs. a generic landing page), unlocking category-style
  // SERP treatment + tying detail pages back to this hub via the
  // numbered list. URL + name only — no employer/salary, mirroring the
  // per-hub policy on /specialty + /state. Capped at 30 items (Google
  // ignores past ~30).
  const itemListJsonLd = initialJobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Healthcare jobs on freejobpost.co',
    numberOfItems: Math.min(initialJobs.length, 30),
    itemListElement: initialJobs.slice(0, 30).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://freejobpost.co/jobs/${j.slug}`,
      name: j.title,
    })),
  } : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
        />
      )}
      <main className="min-h-screen bg-white text-black">
        {/* Header */}
        <section className="border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 shadow-sm px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-[#276749]" />
              {totalActive.toLocaleString()} OPEN ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4 text-[#17324D]">
              Nursing and allied health jobs.
              <br />
              <span className="text-[#276749]">Free to apply.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl text-gray-700">
              Direct employer posts. No account required to browse or apply.
            </p>
          </div>
        </section>

        {/* Filter + list — wrapped in Suspense because JobsFilter uses
           useSearchParams to initialize from URL params (deep-linkable). */}
        <section className="max-w-6xl mx-auto px-6 py-10">
          <Suspense fallback={<div className="h-32" aria-hidden="true" />}>
            <JobsFilter
              initialJobs={initialJobs}
              totalActive={totalActive}
              roles={roles}
              states={states}
              verifiedEmployerIds={verifiedEmployerIds}
            />
          </Suspense>
        </section>
      </main>
    </>
  )
}

// (Removed dead re-exports of PublicJob + label helpers — 2026-05-29 audit.
// JobsFilter and every other consumer import these straight from
// @/lib/public-jobs; the re-exports here were never imported.)
