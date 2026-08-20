// /jobs/federal/[agency]/p/[page] — continuation pages 2..N of the federal
// agency hub. Page 1 stays at /jobs/federal/[agency].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident) and why continuations are deliberately LEAN:
// the agency blurb, the browse-by-state cell grid, the alert-capture form and
// the JSON-LD ItemList all live on page 1 only. Repeating them on every
// continuation would re-serialize ~300KB of identical chrome into each extra
// cache entry — the exact cost this change exists to remove — and would hand
// Google N near-identical documents competing with the page that actually ranks.
//
// NOTE ON ROUTE SHAPE: `p` sits beside the `[state]` dynamic segment. There is
// no collision — /jobs/federal/va/texas is 4 segments and /jobs/federal/va/p/2
// is 5. A bare /jobs/federal/va/p resolves as [state]="p", which
// findStateBySlug rejects into a 404, which is correct.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { FEDERAL_AGENCIES, findAgencyBySlug } from '@/lib/federal-agencies'
import { fetchFederalAgencyJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import {
  HUB_PAGE_SIZE,
  hubTotalPages,
  parseHubPageParam,
  sliceHubPage,
} from '@/lib/hub-pagination'
import { supabase } from '@/lib/supabase'
import { getHubPageCountsCached, hubContinuationPages } from '@/lib/hub-page-counts'
import FederalJobList from '@/components/FederalJobList'
import HubPagination from '@/components/HubPagination'

export const revalidate = 86400

type Params = { agency: string; page: string }

export async function generateStaticParams(): Promise<Params[]> {
  // Only the pages that actually exist. Deriving the range from the family cap
  // instead produced 435 prerendered 404s across the site (39MB of R2 objects
  // that exist only to say "no") on an account already over the free tier.
  // These are the same counts src/lib/sitemap-chunks.ts uses, so what gets
  // prerendered and what pages.xml advertises cannot drift apart.
  //
  // dynamicParams stays true (the default), so a agency whose inventory grows
  // past this list between builds still resolves its next page on demand and
  // ISR-caches it, rather than 404ing a real page.
  const counts = await getHubPageCountsCached(supabase)
  return FEDERAL_AGENCIES.flatMap((a) =>
    hubContinuationPages(counts, 'federalAgency', a.slug, HUB_JOB_LIMITS.federalAgency).map((page) => ({
      agency: a.slug,
      page,
    })),
  )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { agency: slug, page: rawPage } = await params
  const agency = findAgencyBySlug(slug)
  const page = parseHubPageParam(rawPage)
  if (!agency || page === null) return { title: 'Federal healthcare jobs' }

  const canonical = `https://freejobpost.co/jobs/federal/${agency.slug}/p/${page}`
  return {
    title: `${agency.fullName} healthcare jobs, page ${page}`,
    description:
      `Page ${page} of open ${agency.fullName} healthcare positions, sourced from ` +
      `USAJobs and refreshed every 4 hours. Apply directly via the federal application portal.`,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is not on page 1 — it tells the crawler this URL is a duplicate and
    // its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title: `${agency.fullName} healthcare jobs, page ${page}`,
      description: agency.blurb,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function AgencyJobsPaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { agency: slug, page: rawPage } = await params
  const agency = findAgencyBySlug(slug)
  if (!agency) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchFederalAgencyJobs(agency)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const basePath = `/jobs/federal/${agency.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-6xl mx-auto px-6 pt-6 text-xs text-gray-500">
        <Link href="/" className="hover:text-[#003D5C]">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/jobs" className="hover:text-[#003D5C]">Jobs</Link>
        <span className="mx-2">/</span>
        <Link href="/jobs/federal" className="hover:text-[#003D5C]">Federal</Link>
        <span className="mx-2">/</span>
        <Link href={basePath} className="hover:text-[#003D5C]">{agency.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-[#003D5C]">Page {page}</span>
      </div>

      <section className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2 text-[#003D5C]">
          {agency.fullName} healthcare jobs
          <span className="text-[#7FBC00]">, page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to the {agency.name} hub
          </Link>
          .
        </p>

        <FederalJobList jobs={pageJobs} />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${agency.name} jobs`}
        />
      </section>
    </main>
  )
}
