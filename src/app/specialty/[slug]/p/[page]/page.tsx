// /specialty/[slug]/p/[page] — continuation pages 2..N of the specialty hub.
// Page 1 stays at /specialty/[slug].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident) and why continuations are deliberately LEAN:
// the lede, the ResumeMatchCTA, the by-state linkbar, the matrix cell grid, the
// salary-by-state table, the alert-capture form, the other-specialties and
// by-state linkbars and both JSON-LD blocks all live on page 1 only. Repeating
// them on every continuation would re-serialize ~236KB of identical chrome into
// each extra cache entry — the exact cost this change exists to remove — and
// would hand Google N near-identical documents competing with the page that
// actually ranks.
//
// NOTE ON ROUTE SHAPE: `p` sits beside the `[state]` dynamic segment. There is
// no collision — /specialty/cardiology/texas is 3 segments and
// /specialty/cardiology/p/2 is 4. A bare /specialty/cardiology/p resolves as
// [state]="p", which that route rejects into a 404, which is correct.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { SPECIALTY_HUBS, getSpecialtyHub } from '@/lib/specialty-slugs'
import { fetchSpecialtyHubJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
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
  // dynamicParams stays true (the default), so a specialty whose inventory grows
  // past this list between builds still resolves its next page on demand and
  // ISR-caches it, rather than 404ing a real page.
  const counts = await getHubPageCountsCached(supabase)
  return SPECIALTY_HUBS.flatMap((s) =>
    hubContinuationPages(counts, 'specialty', s.slug, HUB_JOB_LIMITS.specialty).map((page) => ({
      slug: s.slug,
      page,
    })),
  )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug, page: rawPage } = await params
  const hub = getSpecialtyHub(slug)
  const page = parseHubPageParam(rawPage)
  if (!hub || page === null) return {}

  const canonical = `https://freejobpost.co/specialty/${hub.slug}/p/${page}`
  const label = hub.title.replace(/ Jobs$/, '').toLowerCase()
  return {
    title: `${hub.title}, page ${page}`,
    description:
      `Page ${page} of open ${label} roles on freejobpost.co. Free to browse, ` +
      `free to apply, no account required. Every listing has a real apply link.`,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is not on page 1 — it tells the crawler this URL is a duplicate and
    // its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title: `${hub.title}, page ${page}`,
      description: hub.shortDescription,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function SpecialtyHubPaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { slug, page: rawPage } = await params
  const hub = getSpecialtyHub(slug)
  if (!hub) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchSpecialtyHubJobs(hub.matchPatterns)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const basePath = `/specialty/${hub.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <article className="max-w-6xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
          <Link href="/" className="hover:text-[#003D5C]">Home</Link>
          {' / '}
          <Link href="/specialty" className="hover:text-[#003D5C]">Specialties</Link>
          {' / '}
          <Link href={basePath} className="hover:text-[#003D5C]">{hub.title}</Link>
          {' / '}
          <span className="text-black font-medium">Page {page}</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          {hub.title} <span className="text-[#7FBC00]">page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to the {hub.title.replace(/ Jobs$/, '').toLowerCase()} hub
          </Link>
          .
        </p>

        <HubJobList jobs={pageJobs} />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${hub.title} jobs`}
        />
      </article>
    </main>
  )
}
