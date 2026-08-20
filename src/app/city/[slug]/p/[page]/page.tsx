// /city/[slug]/p/[page] — continuation pages 2..N of a metro hub. Page 1 stays
// at /city/[slug].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident) and why continuations are deliberately LEAN:
// the editorial lede, the top-employer chips, the computed salary table, the
// alert-capture form, the browse-more linkbar and both JSON-LD blocks all live
// on page 1 only. Repeating them on every continuation would re-serialize the
// same fixed chrome into each extra cache entry — the exact cost this change
// exists to remove — and would hand Google N near-identical documents competing
// with the page that actually ranks.
//
// NOTE ON ROUTE SHAPE: `p` sits beside the `[specialty]` dynamic segment. There
// is no collision — /city/tampa-fl/nurse is 3 segments and /city/tampa-fl/p/2
// is 4. A bare /city/tampa-fl/p resolves as [specialty]="p", which
// getSpecialtyHub() rejects into a 404, which is correct.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CITY_HUBS, getCityHub } from '@/lib/city-slugs'
import { fetchCityHubJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import {
  HUB_PAGE_SIZE,
  hubTotalPages,
  parseHubPageParam,
  sliceHubPage,
} from '@/lib/hub-pagination'
import { supabase } from '@/lib/supabase'
import { getHubPageCountsCached, hubContinuationPages } from '@/lib/hub-page-counts'
import HubJobList from '@/components/HubJobList'
import HubPagination from '@/components/HubPagination'

export const revalidate = 86400

type Params = { slug: string; page: string }

export async function generateStaticParams(): Promise<Params[]> {
  // Only the pages that actually exist. Deriving the range from the family cap
  // instead produced 435 prerendered 404s across the site (39MB of R2 objects
  // that exist only to say "no") on an account already over the free tier.
  // These are the same counts src/lib/sitemap-chunks.ts uses, so what gets
  // prerendered and what pages.xml advertises cannot drift apart.
  //
  // dynamicParams stays true (the default), so a metro whose inventory grows
  // past this list between builds still resolves its next page on demand and
  // ISR-caches it, rather than 404ing a real page.
  const counts = await getHubPageCountsCached(supabase)
  return CITY_HUBS.flatMap((c) =>
    hubContinuationPages(counts, 'city', c.slug, HUB_JOB_LIMITS.city).map((page) => ({
      slug: c.slug,
      page,
    })),
  )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug, page: rawPage } = await params
  const hub = getCityHub(slug)
  const page = parseHubPageParam(rawPage)
  if (!hub || page === null) return { title: 'Healthcare jobs by city' }

  const cityName = hub.name.split(',')[0]
  const title = `${cityName} healthcare jobs, page ${page}`
  const canonical = `https://freejobpost.co/city/${hub.slug}/p/${page}`
  return {
    title,
    description:
      `Page ${page} of open healthcare roles in ${hub.name}. ` +
      `${HUB_PAGE_SIZE} listings per page, posted direct by employers, no recruiter spam.`,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is not on page 1 — it tells the crawler this URL is a duplicate and
    // its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description: hub.metaDescription,
      url: canonical,
      type: 'website',
      images: ['/opengraph-image'],
    },
  }
}

export default async function CityHubPaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { slug, page: rawPage } = await params
  const hub = getCityHub(slug)
  if (!hub) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchCityHubJobs(hub.cityMatchPatterns, hub.state)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const cityName = hub.name.split(',')[0]
  const basePath = `/city/${hub.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-[#003D5C]">Home</Link>
          {' / '}
          <Link href="/city" className="hover:text-[#003D5C]">Cities</Link>
          {' / '}
          <Link href={basePath} className="hover:text-[#003D5C]">{hub.name}</Link>
          {' / '}
          <span className="text-[#003D5C] font-medium">Page {page}</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 text-[#003D5C]">
          {cityName} healthcare jobs
          <span className="text-[#7FBC00]">, page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to the {cityName} hub
          </Link>
          .
        </p>

        <HubJobList jobs={pageJobs} variant="compact" />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${hub.name} jobs`}
        />
      </div>
    </main>
  )
}
