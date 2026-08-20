// /specialty/[slug]/[state]/p/[page] — continuation pages 2..N of a
// specialty × state matrix cell. Page 1 stays at /specialty/[slug]/[state].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident). /specialty/registered-nurse/new-york was a
// 974KB cache entry costing ~4.65ms of interceptor CPU per request — 47% of the
// 10ms budget — because it rendered its whole 200-job corpus inline.
//
// WHY THIS PAGE IS LEAN: page 1 owns the salary table, the by-city linkbar, the
// peer-cell cross-links, the breadcrumb + ItemList JSON-LD and the job-alert
// capture. None of it is repeated here. Two reasons, and they are the same two
// that motivated the whole change:
//   1. COST. That chrome is ~236KB of fixed serialized weight per cache entry.
//      Copying it onto every continuation would re-spend exactly the CPU this
//      change exists to reclaim.
//   2. SEO. The aggregates are cell-wide, not page-wide, so repeating them would
//      hand Google N near-duplicate documents competing with the page that is
//      meant to rank, and the salary/city blocks would say the same thing on
//      every one of them.
// The continuation carries only what is unique to it: its slice of job links.
//
// ROUTE SHAPE: `p` sits below the [state] segment, so there is no collision —
// /specialty/registered-nurse/new-york is 3 segments and
// /specialty/registered-nurse/new-york/p/2 is 5. A bare
// /specialty/registered-nurse/p resolves as [state]="p", which getStateHub
// rejects into a 404. Correct.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getSpecialtyHub } from '@/lib/specialty-slugs'
import { getStateHub } from '@/lib/state-slugs'
import { computeViableCellsViaSql } from '@/lib/specialty-state-matrix'
import { fetchSpecialtyStateCellJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import {
  HUB_PAGE_SIZE,
  hubPageStaticParams,
  hubTotalPages,
  parseHubPageParam,
  sliceHubPage,
} from '@/lib/hub-pagination'
import HubJobList from '@/components/HubJobList'
import HubPagination from '@/components/HubPagination'

export const revalidate = 86400

// Matches the parent cell route. Cells outside the pre-built top-N below still
// resolve and ISR-cache on first hit instead of 404ing a real page.
export const dynamicParams = true

// Same value as the parent route's MAX_SSG_CELLS. Kept in sync by hand because
// the parent is a page module and importing a const out of one drags its whole
// module graph into this route. If you change it there, change it here.
const MAX_SSG_CELLS = 150

type Params = { slug: string; state: string; page: string }

/**
 * Prerender the full page range the family's `.limit()` allows, for the same
 * top-N cells the parent pre-builds: HUB_JOB_LIMITS.specialtyState (200) /
 * HUB_PAGE_SIZE (100) = pages 2..2, so this is one extra page per cell today.
 *
 * Cells with less inventory 404 the surplus pages at render time (see the
 * `page > totalPages` guard below), which costs a tiny cache entry and keeps
 * this list free of a per-cell count query at build time.
 */
export async function generateStaticParams(): Promise<Params[]> {
  // Per-cell counts come free with the viable-cell scan, so this builds only the
  // pages that actually exist. Deriving the range from the family cap instead
  // prerendered a 404 for every cell between 1 and 100 jobs — 435 such entries
  // sitewide on the first build that tried it, 39MB of R2 objects on an account
  // already over the free tier. This is also exactly what sitemap-chunks.ts
  // emits for these cells, so prerendered and advertised cannot drift apart.
  const cells = await computeViableCellsViaSql(supabase)
  return cells
    .slice(0, MAX_SSG_CELLS)
    .flatMap((c) =>
      hubPageStaticParams(Math.min(c.count, HUB_JOB_LIMITS.specialtyState)).map((p) => ({
        slug: c.specialty.slug,
        state: c.state.slug,
        page: p.page,
      })),
    )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug, state, page: rawPage } = await params
  const specialty = getSpecialtyHub(slug)
  const stateHub = getStateHub(state)
  const page = parseHubPageParam(rawPage)
  if (!specialty || !stateHub || page === null) return {}

  const cleanTitle = specialty.title.replace(/ Jobs$/, '')
  const canonical = `https://freejobpost.co/specialty/${specialty.slug}/${stateHub.slug}/p/${page}`
  const title = `${cleanTitle} jobs in ${stateHub.name}, page ${page}`
  const description = `Page ${page} of free ${cleanTitle.toLowerCase()} job listings in ${stateHub.name}. Apply directly, no recruiter spam. Real openings on freejobpost.co.`

  // NO thin-cell noindex gate here, deliberately. The parent applies one
  // (MIN_CELL_JOBS_FOR_INDEX = 5) because dynamicParams=true means any cell URL
  // with a single job would otherwise be served indexable. That cannot happen on
  // a continuation: /p/2 only resolves when the cell has more than HUB_PAGE_SIZE
  // (100) jobs, which is 20x the threshold, and anything thinner 404s on the
  // `page > totalPages` guard below before it can be indexed. Mirroring the gate
  // would mean paying a count query on every metadata render to evaluate a
  // condition that is structurally unreachable.

  return {
    title,
    description,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is only reachable past page 1 — it tells the crawler this URL is a
    // duplicate and its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function SpecialtyStateMatrixPaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { slug, state, page: rawPage } = await params
  const specialty = getSpecialtyHub(slug)
  const stateHub = getStateHub(state)
  if (!specialty || !stateHub) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchSpecialtyStateCellJobs(specialty.matchPatterns, stateHub.abbr)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const cleanSpecialtyTitle = specialty.title.replace(/ Jobs$/, '')
  const basePath = `/specialty/${specialty.slug}/${stateHub.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <article className="max-w-6xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
          <Link href="/" className="hover:text-[#003D5C]">Home</Link>
          {' / '}
          <Link href="/specialty" className="hover:text-[#003D5C]">Specialties</Link>
          {' / '}
          <Link href={`/specialty/${specialty.slug}`} className="hover:text-[#003D5C]">{specialty.title}</Link>
          {' / '}
          <Link href={basePath} className="hover:text-[#003D5C]">{stateHub.name}</Link>
          {' / '}
          <span className="text-black font-medium">Page {page}</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          {cleanSpecialtyTitle} jobs in {stateHub.name}{' '}
          <span className="text-[#7FBC00]">page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to {cleanSpecialtyTitle.toLowerCase()} jobs in {stateHub.name}
          </Link>
          .
        </p>

        <HubJobList jobs={pageJobs} />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${specialty.title} jobs in ${stateHub.name}`}
        />
      </article>
    </main>
  )
}
