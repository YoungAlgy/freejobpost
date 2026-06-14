// /city/[slug] — per-metro healthcare-jobs hub. Closes the gap between
// state-level pages (51, broad) and per-job pages (9k+, narrow). The
// metros listed in src/lib/city-slugs.ts cover the highest-volume US
// healthcare labor markets — about 60-70% of all DB rows resolve to
// one of these hubs.
//
// Matching is case-insensitive substring on the city column joined with
// the state filter. NYC's matchPatterns include the borough names so
// "Brooklyn" and "Bronx" jobs both surface under /city/new-york-ny.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
  remoteLabel,
  employmentLabel,
} from '@/lib/public-jobs'
import { CITY_HUBS, getCityHub } from '@/lib/city-slugs'
import { stripSalarySuffix } from '@/lib/clean-labels'
import { findStateHubByAbbr } from '@/lib/state-slugs'
import {
  aggregateSalariesByGroup,
  aggregateSalariesOverall,
  fmtUsdCompact,
} from '@/lib/salary-aggregates'
import { safeJsonLd } from '@/lib/safe-jsonld'
import JobAlertCapture from '@/components/JobAlertCapture'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'

// 2026-05-28: 600s → 21600s (6h). ISR cost audit — see jobs/[slug].
export const revalidate = 21600

export async function generateStaticParams() {
  return CITY_HUBS.map((c) => ({ slug: c.slug }))
}

// Build a PostgREST `.or()` filter clause that matches any of the hub's
// city patterns. Each pattern is a case-insensitive substring search.
// Example: ['tampa', 'tampa bay'] → "city.ilike.%tampa%,city.ilike.%tampa bay%".
function cityOrFilter(patterns: string[]): string {
  return patterns.map((p) => `city.ilike.%${p}%`).join(',')
}

async function fetchJobCountForCity(
  cityMatchPatterns: string[],
  state: string,
): Promise<number> {
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('state', state)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
  return count ?? 0
}

async function fetchJobsForCity(
  cityMatchPatterns: string[],
  state: string,
): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .eq('state', state)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as PublicJob[]
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const hub = getCityHub(slug)
  if (!hub) return {}
  const title = `${hub.name.split(',')[0]} healthcare jobs`
  return {
    title,
    description: hub.metaDescription,
    alternates: { canonical: `https://freejobpost.co/city/${hub.slug}` },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description: hub.metaDescription,
      url: `https://freejobpost.co/city/${hub.slug}`,
      type: 'website',
      // Fall back to root /opengraph-image — no dedicated per-city OG
      // image generator (the root one is brand-card style + works for
      // every hub type uniformly).
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | freejobpost.co`,
      description: hub.metaDescription,
      images: ['/opengraph-image'],
    },
  }
}

export default async function CityHubPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const hub = getCityHub(slug)
  if (!hub) notFound()

  const [jobs, totalCount] = await Promise.all([
    fetchJobsForCity(hub.cityMatchPatterns, hub.state),
    fetchJobCountForCity(hub.cityMatchPatterns, hub.state),
  ])

  const cityName = hub.name.split(',')[0]
  const stateHub = findStateHubByAbbr(hub.state)

  // Salary aggregates for this metro — computed from the already-fetched job
  // rows (zero extra query). Grouped by specialty/role since the city is fixed,
  // mirroring the /state/[slug] + /specialty/[slug]/[state] panels. Gives the
  // page unique, data-driven content (a "[city] healthcare salaries" table —
  // AI-Overview citable; NO Occupation/EstimatedSalary schema, per the locked
  // rule in salary-aggregates.ts). Honest by construction: the lib floors
  // placeholder/outlier rows ($20K–$1M band) and returns null below 3 ranges.
  const salaryOverall = aggregateSalariesOverall(jobs)
  const salaryByBucket = aggregateSalariesByGroup(
    jobs,
    (j) => stripSalarySuffix(j.specialty || j.role) || null,
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://freejobpost.co/city' },
      { '@type': 'ListItem', position: 3, name: hub.name, item: `https://freejobpost.co/city/${hub.slug}` },
    ],
  }

  // ItemList JSON-LD — same pattern as /state/[slug] + /specialty/[slug].
  // URL + name only (no employer/salary) to avoid the JobPosting
  // misattribution risk. Capped at 30.
  const itemListJsonLd = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Healthcare jobs in ${hub.name}`,
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
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-black text-lg sm:text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-green-700">All jobs</Link>
              <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold">Post a job</Link>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-black">Home</Link>
            {' / '}
            <Link href="/city" className="hover:text-black">Cities</Link>
            {' / '}
            <span className="text-black font-medium">{hub.name}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {cityName} healthcare jobs
          </h1>
          <p className="text-base text-gray-600 mb-6">
            <span className="tabular-nums font-bold text-black">
              {totalCount.toLocaleString()}
            </span>{' '}
            {totalCount === 1 ? 'open role' : 'open roles'} in {hub.name}
          </p>

          <p className="text-lg text-gray-700 mb-8 max-w-3xl leading-relaxed">
            {hub.shortDescription}
          </p>

          {hub.editorialNote && (
            <aside className="border-l-4 border-green-700 bg-green-50 pl-4 py-3 mb-8 text-gray-800 text-sm leading-relaxed max-w-3xl">
              {hub.editorialNote}
            </aside>
          )}

          {hub.topEmployers.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-3">
                Top employers
              </h2>
              <ul className="flex flex-wrap gap-2">
                {hub.topEmployers.map((emp) => (
                  <li
                    key={emp}
                    className="text-sm border-2 border-black px-2.5 py-1 font-medium"
                  >
                    {emp}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Computed salary panel for this metro — unique, data-driven content
              built from the active inventory (zero extra query). Parity with the
              /state/[slug] + /specialty/[slug]/[state] salary panels. */}
          {salaryOverall && (
            <section className="mb-10 max-w-3xl">
              <h2 className="text-2xl font-black tracking-tight mb-2">
                {cityName} healthcare salaries
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Based on {salaryOverall.count} active role{salaryOverall.count === 1 ? '' : 's'} in {hub.name} with published salary ranges. Typical pay: {fmtUsdCompact(salaryOverall.low)}-{fmtUsdCompact(salaryOverall.high)} (median {fmtUsdCompact(salaryOverall.avg)} per year).
              </p>
              {salaryByBucket.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-2 border-black">
                    <thead className="bg-gray-100 text-left">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-bold">Role / specialty</th>
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
                            {fmtUsdCompact(row.low)}-{fmtUsdCompact(row.high)}
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

          {/* Job list — same shape as /state/[slug] + /specialty/[slug] */}
          {jobs.length === 0 ? (
            <section className="border-2 border-black p-8 text-center">
              <p className="text-lg font-bold mb-2">No active openings in {hub.name} right now.</p>
              <p className="text-sm text-gray-600 mb-4">
                Check back soon, or browse{' '}
                {stateHub && (
                  <>
                    <Link href={`/state/${stateHub.slug}`} className="underline hover:text-green-700">
                      all {stateHub.name} jobs
                    </Link>
                    {' or '}
                  </>
                )}
                <Link href="/jobs" className="underline hover:text-green-700">
                  all active openings
                </Link>.
              </p>
            </section>
          ) : (
            <section>
              <h2 className="text-sm font-bold tracking-widest text-gray-500 uppercase mb-4">
                Open roles
              </h2>
              <ul className="divide-y-2 divide-black border-y-2 border-black">
                {jobs.map((j) => {
                  const loc = locationLabel(j)
                  const sal = formatSalary(j.salary_min, j.salary_max)
                  const emp = employmentLabel(j.employment_type)
                  const rem = remoteLabel(j.remote_hybrid)
                  return (
                    <li key={j.id}>
                      <Link
                        href={`/jobs/${j.slug}`}
                        className="block py-4 hover:bg-green-50 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold leading-tight">
                              {stripSalarySuffix(j.title) || j.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-0.5">
                              {loc || '—'}
                              {emp && <> · <span>{emp}</span></>}
                              {rem && rem !== 'Onsite' && <> · <span>{rem}</span></>}
                            </p>
                          </div>
                          {sal && (
                            <div className="text-sm font-bold tabular-nums shrink-0">
                              {sal}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {totalCount > jobs.length && (
                <p className="text-xs text-gray-500 mt-3">
                  Showing newest {jobs.length} of {totalCount.toLocaleString()} —{' '}
                  <Link href="/jobs" className="underline hover:text-black">
                    see all
                  </Link>
                  .
                </p>
              )}
            </section>
          )}

          {/* Job-alert capture — converts passive metro-hub traffic into a
              re-contactable CRM lead tagged with this city's intent. */}
          <div className="mt-12 max-w-3xl">
            <div className="mb-8">
              <ResumeMatchCTA locationLabel={cityName} />
            </div>
            <JobAlertCapture defaultCity={cityName} defaultState={hub.state} source="city_hub" />
          </div>

          <section className="mt-12 border-t-2 border-black pt-8">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Browse more
            </h2>
            <ul className="flex flex-wrap gap-2">
              {stateHub && (
                <li>
                  <Link
                    href={`/state/${stateHub.slug}`}
                    className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                  >
                    All {stateHub.name} jobs →
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href="/city"
                  className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                >
                  All city hubs →
                </Link>
              </li>
              <li>
                <Link
                  href="/specialty"
                  className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                >
                  Browse by specialty →
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </>
  )
}
