import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import { JOB_LIST_FIELDS, type PublicJob } from '@/lib/public-jobs'
import JobsFilter from './jobs-filter'

import { safeJsonLd } from '@/lib/safe-jsonld'
import JobAlertCapture from '@/components/JobAlertCapture'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'
export const metadata: Metadata = {
  title: 'Healthcare jobs: free to browse, free to apply',
  description:
    'Browse 10,000+ healthcare jobs: physicians, nurses, therapists, locum, per-diem roles. Free to browse, free to apply. No account required.',
  alternates: { canonical: 'https://freejobpost.co/jobs' },
  openGraph: {
    title: 'Healthcare jobs | freejobpost.co',
    description: 'Hundreds of healthcare jobs, free to browse and apply.',
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
    title: 'Healthcare jobs | freejobpost.co',
    description: 'Hundreds of healthcare jobs, free to browse and apply.',
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
    // each 4h ingest tick bubbles re-touched ATS rows to the top (keeps the
    // listing lively without one big ingest monopolising the front page).
    supabase
      .from('public_jobs')
      .select(JOB_LIST_FIELDS)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .range(0, INITIAL_PAGE_SIZE - 1),
    // role + state only → derive the filter dropdown options.
    supabase
      .from('public_jobs')
      .select('role, state')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false })
      .range(0, OPTIONS_SAMPLE - 1),
    // Honest total for the "OPEN ROLES" badge — decoupled from how many we render.
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
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
      .not('company_name', 'ilike', 'Ava Health%'),
  ])

  const initialJobs: PublicJob[] = (initialRes.data ?? []) as PublicJob[]

  // FAIL CLOSED (2026-06-02): never cache an empty "no open roles" shell. If the
  // initial job-list query errored (e.g. the 2026-06-02 company_name anon-grant
  // 42501 incident) or returned 0 rows, that ALWAYS means infrastructure failure
  // — the board carries thousands of active jobs at all times. Rendering the
  // empty shell lets ISR cache "0 jobs" for the whole revalidate window (4h),
  // which is exactly what silently emptied this page during that incident.
  // Throwing makes Next serve the last-good ISR cache (stale-while-revalidate);
  // a cold cache 500s, which a crawler retries — vs trusting a 200 "no jobs" and
  // treating the site as dead. Build-phase guarded (NEXT_PHASE) so a DB hiccup
  // during prerender degrades to an empty shell that self-heals on the next
  // runtime revalidate instead of failing the deploy. Mirrors /jobs.xml.
  if (
    (initialRes.error || initialJobs.length === 0) &&
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
        {/* Nav */}
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-lg sm:text-xl tracking-tight">
                freejobpost<span className="text-green-700">.co</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
                BETA
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-green-700 border-b-2 border-black">
                Browse jobs
              </Link>
              <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-green-700">
                For candidates
              </a>
              <Link
                href="/post-job"
                className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
              >
                Post a job →
              </Link>
            </div>
          </div>
        </nav>

        {/* Header */}
        <section className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-green-600" />
              {totalActive.toLocaleString()} OPEN ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              Healthcare jobs.
              <br />
              <span className="text-green-700">Free to apply.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl text-gray-700">
              Browse open roles. No account required.
              Apply directly. No middleman.
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

        {/* Job-alert capture — converts passive browse traffic into a
            re-contactable CRM lead (general intent: no specialty/state hook). */}
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <div className="max-w-3xl">
            <div className="mb-8">
              <ResumeMatchCTA />
            </div>
            <JobAlertCapture source="jobs_browse" />
          </div>
        </section>

        {/* Empty-state safeguard */}
        {initialJobs.length === 0 && (
          <section className="max-w-6xl mx-auto px-6 py-20 text-center">
            <p className="text-2xl font-bold mb-3">No open jobs yet.</p>
            <p className="text-gray-600 mb-6">
              Jobs are being verified. Check back in a few hours, or post one yourself.
            </p>
            <Link
              href="/post-job"
              className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
          </section>
        )}
      </main>
    </>
  )
}

// (Removed dead re-exports of PublicJob + label helpers — 2026-05-29 audit.
// JobsFilter and every other consumer import these straight from
// @/lib/public-jobs; the re-exports here were never imported.)
