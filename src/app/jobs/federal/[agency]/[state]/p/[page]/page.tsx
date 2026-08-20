// /jobs/federal/[agency]/[state]/p/[page] — continuation pages 2..N of the
// federal agency × state cell hub. Page 1 stays at
// /jobs/federal/[agency]/[state].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident) and why continuations are deliberately LEAN:
// the agency blurb hero, the breadcrumb JSON-LD, the ItemList JSON-LD, the
// alert-capture form and the sibling-navigation block all live on page 1 only.
// Repeating them on every continuation would re-serialize the identical chrome
// into each extra cache entry — the exact cost this change exists to remove —
// and would hand Google N near-identical documents competing with the page that
// actually ranks.
//
// NOTE ON ROUTE SHAPE: this is 6 segments (/jobs/federal/va/texas/p/2) while the
// parent agency hub's continuation is 5 (/jobs/federal/va/p/2), so the two `p`
// routes never collide. A bare /jobs/federal/va/texas/p resolves as the cell
// route with [state]="texas" and a trailing segment Next has no route for → 404,
// which is correct.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { findAgencyBySlug } from '@/lib/federal-agencies'
import { STATE_HUBS } from '@/lib/state-slugs'
import { getViableFederalCellsCached } from '@/lib/federal-state-matrix'
import { fetchFederalAgencyStateJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import {
  HUB_PAGE_SIZE,
  hubPageStaticParams,
  hubTotalPages,
  parseHubPageParam,
  sliceHubPage,
} from '@/lib/hub-pagination'
import FederalJobList from '@/components/FederalJobList'
import HubPagination from '@/components/HubPagination'

export const revalidate = 86400

// Matches the parent cell route: prerender the highest-volume cells only, and
// let anything past the cut render on demand and ISR-cache.
const MAX_SSG_FEDERAL_CELLS = 50

// Matches the parent route. Cells outside the prerendered top-50, or cells that
// only cross into a second page after inventory grows, still resolve and cache
// on first hit rather than 404ing a real page.
export const dynamicParams = true

type Params = { agency: string; state: string; page: string }

function findStateBySlug(slug: string) {
  return STATE_HUBS.find((s) => s.slug === slug)
}

/**
 * The parent's prerender set (top-50 cells by count) crossed with the page range
 * the family's `.limit()` allows: HUB_JOB_LIMITS.federalAgencyState (200) /
 * HUB_PAGE_SIZE (100) = pages 2..2. Cells with less inventory than that 404
 * their surplus pages at render time (see the guard below), which costs a tiny
 * cache entry and keeps this list free of a per-cell count query at build time.
 */
export async function generateStaticParams(): Promise<Params[]> {
  // Per-cell counts come free with the viable-cell scan, so this builds only the
  // pages that actually exist. Deriving the range from the family cap instead
  // prerendered a 404 for every cell between 1 and 100 jobs — 435 such entries
  // sitewide on the first build that tried it, 39MB of R2 objects on an account
  // already over the free tier. This is also exactly what sitemap-chunks.ts
  // emits for these cells, so prerendered and advertised cannot drift apart.
  const cells = await getViableFederalCellsCached(supabase)
  return cells
    .slice(0, MAX_SSG_FEDERAL_CELLS)
    .flatMap((c) =>
      hubPageStaticParams(Math.min(c.count, HUB_JOB_LIMITS.federalAgencyState)).map((p) => ({
        agency: c.agency.slug,
        state: c.state.slug,
        page: p.page,
      })),
    )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { agency: agencySlug, state: stateSlug, page: rawPage } = await params
  const agency = findAgencyBySlug(agencySlug)
  const state = findStateBySlug(stateSlug)
  const page = parseHubPageParam(rawPage)
  if (!agency || !state || page === null) {
    return { title: 'Federal healthcare jobs' }
  }

  // NO thin-cell noindex gate here, unlike the parent cell page. The parent
  // runs a head-only count and noindexes cells under MIN_CELL_JOBS_FOR_INDEX=5
  // because dynamicParams=true makes even a 1-job cell crawler-reachable. A
  // continuation cannot be in that situation: page 2 only exists when the cell
  // has more than HUB_PAGE_SIZE=100 jobs, and the render guard below 404s it
  // otherwise. Adding the gate would mean paying for a count query on every
  // metadata render to answer a question whose answer is always "not thin".
  const canonical = `https://freejobpost.co/jobs/federal/${agency.slug}/${state.slug}/p/${page}`
  return {
    title: `${agency.fullName} healthcare jobs in ${state.name}, page ${page}`,
    description:
      `Page ${page} of open ${agency.name} healthcare positions in ${state.name}, ` +
      `sourced from USAJobs and refreshed every 4 hours. Apply directly via the ` +
      `federal application portal.`,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is not on page 1 — it tells the crawler this URL is a duplicate and
    // its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title: `${agency.fullName} healthcare jobs - ${state.name}, page ${page}`,
      description: agency.blurb,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function FederalAgencyStatePaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { agency: agencySlug, state: stateSlug, page: rawPage } = await params
  const agency = findAgencyBySlug(agencySlug)
  const state = findStateBySlug(stateSlug)
  if (!agency || !state) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchFederalAgencyStateJobs(agency, state.abbr)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const basePath = `/jobs/federal/${agency.slug}/${state.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-6xl mx-auto px-6 pt-6 text-xs text-gray-500">
        <Link href="/" className="hover:text-[#003D5C]">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/jobs" className="hover:text-[#003D5C]">Jobs</Link>
        <span className="mx-2">/</span>
        <Link href="/jobs/federal" className="hover:text-[#003D5C]">Federal</Link>
        <span className="mx-2">/</span>
        <Link href={`/jobs/federal/${agency.slug}`} className="hover:text-[#003D5C]">
          {agency.name}
        </Link>
        <span className="mx-2">/</span>
        <Link href={basePath} className="hover:text-[#003D5C]">{state.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-[#003D5C]">Page {page}</span>
      </div>

      <section className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 text-[#003D5C]">
          {agency.fullName} jobs in {state.name}
          <span className="text-[#7FBC00]">, page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to {agency.name} jobs in {state.name}
          </Link>
          .
        </p>

        <FederalJobList jobs={pageJobs} hoverClass="hover:bg-[#003D5C]/5" />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${agency.name} jobs in ${state.name}`}
        />
      </section>
    </main>
  )
}
