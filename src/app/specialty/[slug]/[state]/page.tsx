// /specialty/[slug]/[state] — specialty × state matrix page. The intersection
// of two existing hubs ("Cardiology jobs in Florida"). Targets long-tail
// "[specialty] jobs [state]" queries that beat both parent hubs in intent
// specificity.
//
// Only cells with ≥5 active matching jobs are generated; thin combinations
// 404 by design. As supply diversifies more states will light up.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import { getSpecialtyHub } from '@/lib/specialty-slugs'
import { getStateHub } from '@/lib/state-slugs'
import { computeViableCellsViaSql } from '@/lib/specialty-state-matrix'
import {
  aggregateSalariesByGroup,
  aggregateSalariesOverall,
  fmtUsdCompact,
} from '@/lib/salary-aggregates'
import { stripSalarySuffix } from '@/lib/clean-labels'
import { safeJsonLd } from '@/lib/safe-jsonld'
// Filter-build moved to src/lib/specialty-filter.ts + unit-tested. See
// the shared helper for the full bug write-up (commit 6e2b839,
// 2026-05-22 critical PostgREST .or() double-encoding fix).
import { buildSpecialtyOrFilter as buildHubOrFilter } from '@/lib/specialty-filter'

export const revalidate = 600

// Allow on-demand ISR for cells outside the top-N pre-built set. Build was
// timing out (60s/page Vercel cap) on the biggest cells (PA pharmacist,
// TX physician-assistant, VA registered-nurse, OH surgical-tech) because
// the .or() ILIKE filter slowed down as public_jobs grew past ~50K rows.
// Top-N pre-builds the SEO-most-important cells; the rest render on
// first visit and cache for 600s. Build time drops from 60s+/page on
// heavy cells to negligible (those just become ISR fallbacks).
export const dynamicParams = true

const MAX_SSG_CELLS = 150

type Params = { slug: string; state: string }

export async function generateStaticParams(): Promise<Params[]> {
  // Per-cell SQL count via the shared helper. Returns cells sorted by
  // count DESC, so top-N = highest-traffic. The remaining ~380+ cells
  // ISR-render on demand via dynamicParams=true above.
  const cells = await computeViableCellsViaSql(supabase)
  return cells.slice(0, MAX_SSG_CELLS).map((c) => ({ slug: c.specialty.slug, state: c.state.slug }))
}

async function fetchCellJobs(matchPatterns: readonly string[], stateAbbr: string): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .eq('state', stateAbbr)
    .or(buildHubOrFilter(matchPatterns))
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as PublicJob[]
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug, state } = await params
  const specialty = getSpecialtyHub(slug)
  const stateHub = getStateHub(state)
  if (!specialty || !stateHub) return {}
  const cleanTitle = specialty.title.replace(/ Jobs$/, '')
  const title = `${cleanTitle} jobs in ${stateHub.name}`
  const description = `Free ${cleanTitle.toLowerCase()} job listings in ${stateHub.name} — salary ranges, apply directly, no recruiter spam. Real openings on freejobpost.co.`
  return {
    title,
    description,
    alternates: {
      canonical: `https://freejobpost.co/specialty/${specialty.slug}/${stateHub.slug}`,
    },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description,
      url: `https://freejobpost.co/specialty/${specialty.slug}/${stateHub.slug}`,
      type: 'website',
    },
  }
}

export default async function SpecialtyStateMatrixPage(
  { params }: { params: Promise<Params> },
) {
  const { slug, state } = await params
  const specialty = getSpecialtyHub(slug)
  const stateHub = getStateHub(state)
  if (!specialty || !stateHub) notFound()

  const jobs = await fetchCellJobs(specialty.matchPatterns, stateHub.abbr)
  // Hard 404 only when the cell is truly empty — guards against direct hits
  // on URLs that were never in generateStaticParams. Cells that DID build
  // but dropped below the threshold between deploys still render (with a
  // sparse-inventory message handled inline below), which is better UX
  // than 404'ing a previously-indexed URL.
  if (jobs.length === 0) notFound()

  // Salary aggregates within this cell. Grouped by role/specialty (sub-cell
  // breakdown) since state is already fixed.
  const salaryOverall = aggregateSalariesOverall(jobs)
  const salaryByBucket = aggregateSalariesByGroup(
    jobs,
    (j) => stripSalarySuffix(j.specialty || j.role) || null,
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // Cities + specialty-role mix for context blocks
  const cities = Array.from(
    new Set(jobs.map((j) => j.city?.trim()).filter((c): c is string => !!c))
  ).sort()

  const cleanSpecialtyTitle = specialty.title.replace(/ Jobs$/, '')

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Specialties', item: 'https://freejobpost.co/specialty' },
      {
        '@type': 'ListItem',
        position: 3,
        name: specialty.title,
        item: `https://freejobpost.co/specialty/${specialty.slug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: stateHub.name,
        item: `https://freejobpost.co/specialty/${specialty.slug}/${stateHub.slug}`,
      },
    ],
  }

  // ItemList JSON-LD — specialty×state matrix is the deepest long-tail
  // surface ("registered-nurse jobs florida", "cardiology jobs texas").
  // Typed list signal helps Google treat these as category pages and
  // distinguish them from blog/article surfaces. URL + name only, capped
  // at 30 (Google ignores past ~30).
  const itemListJsonLd = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cleanSpecialtyTitle} jobs in ${stateHub.name}`,
    numberOfItems: Math.min(jobs.length, 30),
    itemListElement: jobs.slice(0, 30).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://freejobpost.co/jobs/${j.slug}`,
      name: j.title,
    })),
  } : null

  // Peer-cell cross-links DEFERRED to a follow-up commit. The fully-correct
  // version requires the SQL-counted helper (50 + 18 = 68 narrow queries per
  // matrix page) — measured under Next's 60s build worker timeout for some
  // cells, so v1 ships without them. Back-links to /specialty and /state
  // parent hubs still cover the internal-linking baseline.

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
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-black text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700">All jobs</Link>
              <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold">Post a job</Link>
            </div>
          </div>
        </nav>

        <article className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
            <Link href="/" className="hover:text-green-700">Home</Link>
            {' / '}
            <Link href="/specialty" className="hover:text-green-700">Specialties</Link>
            {' / '}
            <Link href={`/specialty/${specialty.slug}`} className="hover:text-green-700">{specialty.title}</Link>
            {' / '}
            <span className="text-black font-medium">{stateHub.name}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {cleanSpecialtyTitle} jobs in {stateHub.name}{' '}
            <span className="text-green-700">— {jobs.length}</span>
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed mb-10 max-w-3xl">
            {jobs.length} active {cleanSpecialtyTitle.toLowerCase()} role{jobs.length === 1 ? '' : 's'} in {stateHub.name} on freejobpost.co. Free to browse, free to apply, no recruiter spam — every listing has a real apply link going to the hiring employer.
          </p>

          {/* By-city linkbar */}
          {cities.length > 1 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 self-center mr-2">By city:</span>
              {cities.map((c) => (
                <span key={c} className="text-xs border border-black px-2 py-1">
                  {c} ({jobs.filter((j) => j.city === c).length})
                </span>
              ))}
            </div>
          )}

          {/* Computed salary panel for this cell */}
          {salaryOverall && (
            <section className="mb-10 max-w-3xl">
              <h2 className="text-2xl font-black tracking-tight mb-2">
                {cleanSpecialtyTitle} salaries in {stateHub.name}
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Based on {salaryOverall.count} active {cleanSpecialtyTitle.toLowerCase()} role{salaryOverall.count === 1 ? '' : 's'} in {stateHub.name} with published salary ranges. Typical pay: {fmtUsdCompact(salaryOverall.low)}–{fmtUsdCompact(salaryOverall.high)} (median {fmtUsdCompact(salaryOverall.avg)} per year).
              </p>
              {salaryByBucket.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-2 border-black">
                    <thead className="bg-gray-100 text-left">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-bold">Role / sub-specialty</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Roles</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Typical pay</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Median</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {salaryByBucket.map((row) => (
                        <tr key={row.label}>
                          <td className="px-3 py-2">{row.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmtUsdCompact(row.low)}&ndash;{fmtUsdCompact(row.high)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {fmtUsdCompact(row.avg)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Job list */}
          <ul className="border-t-2 border-black">
            {jobs.map((j) => (
              <li key={j.id} className="border-b border-black/10 py-5">
                <Link href={`/jobs/${j.slug}`} className="group block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-black tracking-tight group-hover:text-green-700 mb-1">
                        {stripSalarySuffix(j.title) || j.title}
                      </h2>
                      <p className="text-sm text-gray-700">
                        {locationLabel(j)} · {employmentLabel(j.employment_type)}
                        {j.remote_hybrid ? ` · ${remoteLabel(j.remote_hybrid)}` : ''}
                        {j.specialty ? ` · ${stripSalarySuffix(j.specialty)}` : ''}
                      </p>
                    </div>
                    {(j.salary_min || j.salary_max) && (
                      <div className="text-sm font-bold whitespace-nowrap shrink-0">
                        {formatSalary(j.salary_min, j.salary_max)}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Back-links to the parent hubs */}
          <section className="mt-12 border-t-2 border-black pt-8 flex flex-wrap gap-4">
            <Link
              href={`/specialty/${specialty.slug}`}
              className="text-sm font-bold hover:text-green-700"
            >
              ← All {cleanSpecialtyTitle} jobs (nationwide)
            </Link>
            <span className="text-gray-300">·</span>
            <Link
              href={`/state/${stateHub.slug}`}
              className="text-sm font-bold hover:text-green-700"
            >
              ← All {stateHub.name} healthcare jobs
            </Link>
          </section>
        </article>
      </main>
    </>
  )
}

