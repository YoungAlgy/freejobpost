// /state/[slug]/p/[page] — continuation pages 2..N of the state hub. Page 1
// stays at /state/[slug].
//
// See src/lib/hub-pagination.ts for why these routes exist (the 2026-08-19
// Workers-free-plan CPU incident). /state/new-mexico measured 1.40MB of cache
// entry and 7.29ms of interceptor CPU per request — 73% of the 10ms budget, on
// every single request, growing with inventory forever.
//
// WHY THIS PAGE IS DELIBERATELY LEAN: the licensing + market aside, the metro
// and employer blocks, the city linkbar, the specialty distribution, the
// matrix deep-links, the FAQ, the salary table, JobAlertCapture and the
// BreadcrumbList/ItemList JSON-LD all live on page 1 only. Two reasons, and
// both matter. (1) Cost: that chrome is ~350KB of the state family's fixed
// per-entry weight, and re-serializing it into every continuation would put
// back most of the CPU this change exists to remove. (2) SEO: those blocks are
// the page's unique content, and copying them onto N URLs hands Google N
// near-duplicate documents competing with the one that actually ranks.
//
// ROUTE SHAPE: /state/[slug] has no other dynamic child segment, so `p` cannot
// collide with anything. A bare /state/florida/p is not a route and 404s.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { STATE_HUBS, getStateHub } from '@/lib/state-slugs'
import { fetchStateHubJobs, HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
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
  // dynamicParams stays true (the default), so a state whose inventory grows
  // past this list between builds still resolves its next page on demand and
  // ISR-caches it, rather than 404ing a real page.
  const counts = await getHubPageCountsCached(supabase)
  return STATE_HUBS.flatMap((s) =>
    hubContinuationPages(counts, 'state', s.slug, HUB_JOB_LIMITS.state).map((page) => ({
      slug: s.slug,
      page,
    })),
  )
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug, page: rawPage } = await params
  const hub = getStateHub(slug)
  const page = parseHubPageParam(rawPage)
  if (!hub || page === null) return { title: 'Healthcare jobs by state' }

  const canonical = `https://freejobpost.co/state/${hub.slug}/p/${page}`
  const title = `${hub.name} healthcare jobs, page ${page}`
  const description =
    `Page ${page} of open ${hub.name} healthcare jobs on freejobpost.co. ` +
    `Physician, NP, PA, RN, CRNA, and allied roles with real apply links. ` +
    `Free to browse, free to apply, no recruiter spam.`
  return {
    title,
    description,
    // SELF-canonical, not a pointer back at page 1. Canonicalising a
    // continuation to page 1 is the classic way to make Google drop every job
    // that is not on page 1 — it tells the crawler this URL is a duplicate and
    // its unique links are not worth keeping.
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function StateHubPaginatedPage(
  { params }: { params: Promise<Params> },
) {
  const { slug, page: rawPage } = await params
  const hub = getStateHub(slug)
  if (!hub) notFound()

  // Rejects /p/1, /p/01, /p/0 and anything non-numeric so page 1 keeps exactly
  // one URL and no duplicate-content family can form under it.
  const page = parseHubPageParam(rawPage)
  if (page === null) notFound()

  // Same fetch as page 1, from the shared module, so the pages partition one
  // consistently-ordered corpus instead of two independently-built ones.
  const jobs = await fetchStateHubJobs(hub.abbr)
  const totalPages = hubTotalPages(jobs.length)
  if (page > totalPages) notFound()

  const pageJobs = sliceHubPage(jobs, page)
  if (pageJobs.length === 0) notFound()

  const basePath = `/state/${hub.slug}`

  return (
    <main className="min-h-screen bg-white text-black">
      <article className="max-w-6xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
          <Link href="/" className="hover:text-[#003D5C]">Home</Link>
          {' / '}
          <Link href="/state" className="hover:text-[#003D5C]">States</Link>
          {' / '}
          <Link href={basePath} className="hover:text-[#003D5C]">{hub.name}</Link>
          {' / '}
          <span className="text-black font-medium">Page {page}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
          {hub.name} healthcare jobs
          <span className="text-[#7FBC00]">, page {page}</span>
        </h1>
        <p className="text-sm text-gray-600 mb-8">
          Showing roles {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString()}
          {' to '}
          {((page - 1) * HUB_PAGE_SIZE + pageJobs.length).toLocaleString()} of{' '}
          {jobs.length.toLocaleString()}.{' '}
          <Link href={basePath} className="underline hover:text-[#003D5C]">
            Back to the {hub.name} hub
          </Link>
          .
        </p>

        <HubJobList jobs={pageJobs} />

        <HubPagination
          basePath={basePath}
          page={page}
          totalPages={totalPages}
          label={`${hub.name} jobs`}
        />
      </article>
    </main>
  )
}
