import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import { safeJsonLd } from '@/lib/safe-jsonld'
import { type PublicJob } from '@/lib/public-jobs'
import {
  findAgencyBySlug,
  agencyOrFilter,
} from '@/lib/federal-agencies'
import { STATE_HUBS } from '@/lib/state-slugs'
import { getViableFederalCellsCached } from '@/lib/federal-state-matrix'
import {
  fetchFederalAgencyStateJobs,
  fetchFederalAgencyStateJobCount,
} from '@/lib/hub-job-queries'
import { HUB_PAGE_SIZE, hubTotalPages, sliceHubPage } from '@/lib/hub-pagination'
import FederalJobList from '@/components/FederalJobList'
import HubPagination from '@/components/HubPagination'
import JobAlertCapture from '@/components/JobAlertCapture'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'

// 2026-05-28 cost pass: 300s → 1h → 6h, matching the sibling specialty/
// state/city hubs (21600s). Federal inventory changes on the 4h ingest cron,
// so 6h is plenty fresh. See jobs/[slug] for rationale.
export const revalidate = 86400

// Pre-render the highest-volume cells only — the federal-state-matrix
// helper sorts cells by count DESC so the top-N slice is the SEO-most-
// important set. Build was timing out at 60s/page on /jobs/federal/va/*
// pages (largest agency by inventory). Setting dynamicParams=true lets
// smaller cells (or new ones added by future USAJobs refreshes) render
// on-demand and cache via ISR for 300s.
const MAX_SSG_FEDERAL_CELLS = 50

// Thin-cell SEO gate: an agency×state cell with fewer than this many active
// jobs is noindex'd (a thin doorway page). Mirrors /specialty/[slug]/[state]'s
// MIN_CELL_JOBS_FOR_INDEX=5 and /city/[slug]/[specialty]'s <5 policy.
const MIN_CELL_JOBS_FOR_INDEX = 5

export async function generateStaticParams() {
  const cells = await getViableFederalCellsCached(supabase)
  return cells
    .slice(0, MAX_SSG_FEDERAL_CELLS)
    .map((c) => ({ agency: c.agency.slug, state: c.state.slug }))
}

export const dynamicParams = true

function findStateBySlug(slug: string) {
  return STATE_HUBS.find((s) => s.slug === slug)
}

export async function generateMetadata(
  { params }: { params: Promise<{ agency: string; state: string }> },
): Promise<Metadata> {
  const { agency: agencySlug, state: stateSlug } = await params
  const agency = findAgencyBySlug(agencySlug)
  const state = findStateBySlug(stateSlug)
  if (!agency || !state) {
    return { title: 'Federal healthcare jobs' }
  }
  // Thin-cell noindex: a cell with <5 active jobs is a thin doorway page. It
  // still renders (good UX + onward internal links) but stays out of Google's
  // index — consistent with the sibling /specialty/[slug]/[state] (noindex <5)
  // + /city/[slug]/[specialty] (404 <5) hubs. dynamicParams=true makes these
  // cells crawler-reachable, so the gate matters. Self-heals past 5 on the next
  // 6h revalidate. (Head-only count; deduped with the body's count via the
  // supabase fetch cache within a render.)
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'usajobs:federal')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .eq('state', state.abbr)
    .or(agencyOrFilter(agency))
  const canonical = `https://freejobpost.co/jobs/federal/${agency.slug}/${state.slug}`
  return {
    title: `${agency.fullName} healthcare jobs in ${state.name}`,
    description: `Open ${agency.name} healthcare positions in ${state.name}. Sourced from USAJobs, refreshed every 4 hours. Apply directly via the federal application portal.`,
    alternates: { canonical },
    ...((count ?? 0) < MIN_CELL_JOBS_FOR_INDEX ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${agency.fullName} healthcare jobs - ${state.name}`,
      description: `${agency.blurb}`,
      url: canonical,
      type: 'website',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${agency.fullName} healthcare jobs - ${state.name}`,
      description: `${agency.blurb}`,
      images: ['/opengraph-image'],
    },
  }
}

export default async function FederalAgencyStatePage(
  { params }: { params: Promise<{ agency: string; state: string }> },
) {
  const { agency: agencySlug, state: stateSlug } = await params
  const agency = findAgencyBySlug(agencySlug)
  const state = findStateBySlug(stateSlug)
  if (!agency || !state) notFound()

  // Same agency-keyword filter as the parent /jobs/federal/[agency] page,
  // intersected with state. Both queries now live in src/lib/hub-job-queries.ts
  // so page 1 and every /p/<n> continuation fetch byte-identically (including
  // the federal family's `.order('updated_at')`, which differs from the
  // created_at ordering the state/specialty/city hubs use). If the two drifted,
  // page 2 would slice a differently-ordered corpus than page 1 skipped and
  // jobs would silently vanish from the middle of the series. The list stays
  // capped at HUB_JOB_LIMITS.federalAgencyState = 200 (agency × state cells are
  // narrower than the global federal hub); the count feeds the header badge.
  const [jobs, cellCount] = await Promise.all([
    fetchFederalAgencyStateJobs(agency, state.abbr),
    fetchFederalAgencyStateJobCount(agency, state.abbr),
  ])

  const totalCount = cellCount ?? jobs.length

  // 🔴 2026-08-19 CPU FIX — see src/lib/hub-pagination.ts. This page rendered
  // all 200 fetched jobs inline: /jobs/federal/va/texas measured a 1.20MB R2
  // cache entry costing ~5.86ms of cache-interceptor CPU per request, 59% of
  // the 10ms Workers-free-plan budget, and it grew with inventory forever.
  // `jobs` (the FULL fetched set) is still what the count badge, the ItemList
  // JSON-LD and the empty-state check below read — only the rendered <li> list
  // is sliced, so nothing on the page starts lying.
  const totalPages = hubTotalPages(jobs.length)
  const pageJobs: PublicJob[] = sliceHubPage(jobs, 1)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
      { '@type': 'ListItem', position: 3, name: 'Federal', item: 'https://freejobpost.co/jobs/federal' },
      {
        '@type': 'ListItem',
        position: 4,
        name: agency.fullName,
        item: `https://freejobpost.co/jobs/federal/${agency.slug}`,
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: state.name,
        item: `https://freejobpost.co/jobs/federal/${agency.slug}/${state.slug}`,
      },
    ],
  }

  // ItemList JSON-LD: federal agency × state matrix is a high-intent
  // long-tail query target ("va jobs florida", "ihs jobs nm", etc.).
  // Giving Google a typed list of the agency-in-state jobs improves
  // category-page interpretation. URL + name only; capped at 30.
  const itemListJsonLd = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${agency.fullName} jobs in ${state.name}`,
    numberOfItems: Math.min(jobs.length, 30),
    itemListElement: jobs.slice(0, 30).map((j, i) => ({
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
          <span className="text-[#003D5C]">{state.name}</span>
        </div>

        <section className="border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-[#7FBC00]" />
              {totalCount.toLocaleString()} {agency.name.toUpperCase()} ROLES IN {state.name.toUpperCase()}
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              {agency.fullName}
              <br />
              <span className="text-[#7FBC00]">{state.name} jobs.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-3xl text-gray-700">
              {agency.blurb}
            </p>
            <p className="mt-4 text-sm text-gray-500">
              Filtered to {state.name} (state abbreviation: {state.abbr}). Sourced
              from USAJobs and refreshed every 4 hours. Apply links route directly
              to the federal application portal.
            </p>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-10">
          {jobs.length === 0 ? (
            <div className="py-12 text-center border border-gray-200 rounded-lg bg-gray-50">
              <p className="text-lg font-bold mb-2">
                No active {agency.name} listings in {state.name} right now.
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Federal job postings move fast.{' '}
                <Link
                  href={`/jobs/federal/${agency.slug}`}
                  className="underline hover:text-[#003D5C]"
                >
                  See all {agency.name} jobs nationwide
                </Link>{' '}
                or{' '}
                <Link href="/jobs/federal" className="underline hover:text-[#003D5C]">
                  browse other agencies
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold">
                  {totalCount.toLocaleString()}{' '}
                  {totalCount === 1 ? 'role' : 'roles'}
                  {pageJobs.length < totalCount && ` · showing ${pageJobs.length}`}
                </p>
              </div>
              {/* Shared with the parent agency hub and with every /p/<n>
                  continuation so a paginated series draws identical rows.
                  hoverClass is explicit: this cell page has always used the
                  navy tint, while the parent uses the green one that
                  FederalJobList defaults to. */}
              <FederalJobList jobs={pageJobs} hoverClass="hover:bg-[#003D5C]/5" />
              <HubPagination
                basePath={`/jobs/federal/${agency.slug}/${state.slug}`}
                page={1}
                totalPages={totalPages}
                label={`${agency.name} jobs in ${state.name}`}
              />
              {jobs.length < totalCount && (
                <p className="mt-6 text-center text-sm text-gray-500">
                  Showing the newest {jobs.length.toLocaleString()} of{' '}
                  {totalCount.toLocaleString()} {agency.name} jobs in {state.name}
                  {totalPages > 1 && `, ${HUB_PAGE_SIZE} per page`}. For more, view{' '}
                  <Link
                    href={`/jobs/federal/${agency.slug}`}
                    className="underline hover:text-[#003D5C]"
                  >
                    all {agency.name} nationwide
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </section>

        {/* Job-alert capture — federal roles apply out via the USAJobs portal,
            so capture the high-intent agency×state browser as a re-contactable
            CRM lead. defaultState = the cell's state ABBR (matches jobs.state so
            the digest's state matching works; consistent with the city hub). No
            defaultSpecialty (federal spans specialties — a non-specialty string
            would pollute matching). source='federal_agency_state' (free-text
            subscribers.source, no CHECK). */}
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <div className="max-w-3xl">
            <div className="mb-8">
              <ResumeMatchCTA locationLabel={state.name} />
            </div>
            <JobAlertCapture defaultState={state.abbr} source="federal_agency_state" />
          </div>
        </section>

        {/* Sibling-state navigation — link back up and out so this isn't a dead-end leaf */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="border-t border-gray-200 pt-8">
            <p className="text-sm text-gray-600">
              ←{' '}
              <Link
                href={`/jobs/federal/${agency.slug}`}
                className="underline hover:text-[#003D5C]"
              >
                All {agency.name} jobs (nationwide)
              </Link>{' '}
              · ←{' '}
              <Link
                href="/jobs/federal"
                className="underline hover:text-[#003D5C]"
              >
                Browse other federal agencies
              </Link>
            </p>
          </div>
        </section>
      </main>
    </>
  )
}
