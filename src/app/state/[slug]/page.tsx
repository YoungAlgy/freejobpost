// /state/[slug] — SEO hub page listing jobs filtered by state. One page
// per top US state for healthcare-job density (FL, TX, CA, NY, IL, PA,
// OH, GA, NC, MA, MI). Mirrors the /specialty/[slug] pattern.

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
import { STATE_HUBS, getStateHub } from '@/lib/state-slugs'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { composeHubMetaDescription } from '@/lib/hub-meta-description'
import {
  aggregateSalariesByGroup,
  aggregateSalariesOverall,
  fmtUsdCompact,
} from '@/lib/salary-aggregates'

import { safeJsonLd } from '@/lib/safe-jsonld'
export const revalidate = 600

export async function generateStaticParams() {
  return STATE_HUBS.map((s) => ({ slug: s.slug }))
}

async function fetchJobCountForState(abbr: string): Promise<number> {
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('state', abbr)
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
  return count ?? 0
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const hub = getStateHub(slug)
  if (!hub) return {}
  const title = `${hub.name} healthcare jobs`
  const count = await fetchJobCountForState(hub.abbr)
  const description = composeHubMetaDescription({
    count,
    staticDescription: hub.metaDescription,
    label: hub.name,
    kind: 'state',
  })
  return {
    title,
    description,
    alternates: { canonical: `https://freejobpost.co/state/${hub.slug}` },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description,
      url: `https://freejobpost.co/state/${hub.slug}`,
      type: 'website',
    },
  }
}

async function fetchJobsForState(abbr: string): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .eq('state', abbr)
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(300)
  return (data ?? []) as PublicJob[]
}

export default async function StateHubPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const hub = getStateHub(slug)
  if (!hub) notFound()

  const jobs = await fetchJobsForState(hub.abbr)

  // Cities represented in the result set
  const cities = Array.from(
    new Set(jobs.map((j) => j.city?.trim()).filter((c): c is string => !!c))
  ).sort()

  // Specialty distribution — used to surface "in-demand specialties in [state]"
  const specialtyCounts = new Map<string, number>()
  for (const j of jobs) {
    const s = j.specialty?.trim()
    if (s) specialtyCounts.set(s, (specialtyCounts.get(s) ?? 0) + 1)
  }
  const topSpecialties = Array.from(specialtyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  // Salary aggregates — computed from the same `jobs` array we already
  // have in hand. No extra Supabase query. Targets AI Overview citability
  // for "[specialty] salary [state]" queries. Plain HTML output (no
  // Occupation / EstimatedSalary schema — see feedback_seo_dead_schemas).
  const salaryByBucket = aggregateSalariesByGroup(
    jobs,
    (j) => {
      let s = j.specialty?.trim() || j.role?.trim() || ''
      // Some seeded job rows bled the salary into the specialty field
      // (e.g. "Interventional Pain Physician – $550K"). Strip any
      // trailing dash + dollar-amount so the table label reads cleanly.
      s = s.replace(/\s*[–\-]\s*\$[\d.,KMkm\s/-]+$/, '').trim()
      return s || null
    },
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const salaryOverall = aggregateSalariesOverall(jobs)

  // NOTE: JobPosting JSON-LD is intentionally NOT emitted here.
  // Each individual /jobs/[slug] page already emits accurate per-job JSON-LD
  // with the correct hiringOrganization pulled from the DB. Emitting JobPosting
  // JSON-LD on hub/listing pages with a hardcoded org would misattribute
  // real-employer jobs to Ava Health Partners and can trigger Google for Jobs
  // rejection for schema inaccuracy.

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'States', item: 'https://freejobpost.co/state' },
      { '@type': 'ListItem', position: 3, name: hub.name, item: `https://freejobpost.co/state/${hub.slug}` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
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
            <Link href="/state" className="hover:text-green-700">States</Link>
            {' / '}
            <span className="text-black font-medium">{hub.name}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {hub.name} healthcare jobs <span className="text-green-700">— {jobs.length}</span>
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed mb-8 max-w-3xl">
            {hub.shortDescription} Free to browse, free to apply, no recruiter spam. Roles are placed by Ava Health Partners&apos; recruiter book or directly by US healthcare employers — every listing has a real apply link.
          </p>

          {/* Licensing + market notes — per-state factual content. Renders only when
              the editorial fields are populated on state-slugs.ts. Adds the unique
              per-page data the post-March-2024 core update expects from templated
              hubs (board name, NLC status, market sentence). NOT wrapped in
              FAQPage / Occupation schema — those rich results are deprecated. */}
          {(hub.nursingBoardName || hub.nlcCompactStatus || hub.editorialNote) && (
            <aside
              className="mb-10 border-l-4 border-green-700 bg-green-50/60 px-5 py-4 max-w-3xl"
              aria-label={`Licensing and market notes for ${hub.name}`}
            >
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                Licensing + market notes
              </h2>
              <ul className="text-sm text-gray-800 space-y-1.5">
                {hub.nursingBoardName && (
                  <li>
                    <span className="font-semibold">Nursing board:</span>{' '}
                    {hub.nursingBoardUrl ? (
                      <a
                        href={hub.nursingBoardUrl}
                        className="underline hover:text-green-700"
                        target="_blank"
                        rel="noopener nofollow"
                      >
                        {hub.nursingBoardName}
                      </a>
                    ) : (
                      hub.nursingBoardName
                    )}
                  </li>
                )}
                {hub.nlcCompactStatus && (
                  <li>
                    <span className="font-semibold">Nurse Licensure Compact:</span>{' '}
                    {hub.nlcCompactStatus === 'compact' &&
                      'Compact member — multi-state RN licenses are valid here.'}
                    {hub.nlcCompactStatus === 'pending' &&
                      'NLC implementation pending — check current status before relocating.'}
                    {hub.nlcCompactStatus === 'none' &&
                      'Not a compact state — RNs need a separate state license.'}
                  </li>
                )}
                {typeof hub.rnLicenseInitialFee === 'number' && (
                  <li>
                    <span className="font-semibold">Initial RN license fee:</span>{' '}
                    ${hub.rnLicenseInitialFee} (by examination)
                  </li>
                )}
              </ul>
              {hub.editorialNote && (
                <p className="text-sm text-gray-700 leading-relaxed mt-3">
                  {hub.editorialNote}
                </p>
              )}
            </aside>
          )}

          {/* Major metros — local relevance signal */}
          <div className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Major {hub.name} metros</h2>
            <div className="flex flex-wrap gap-2">
              {hub.majorMetros.map((m) => (
                <span key={m} className="text-sm border border-black/30 px-2 py-1">{m}</span>
              ))}
            </div>
          </div>

          {/* Top employers — only render when there's enough on-page inventory
             to make the line credible. With <3 jobs in this state, listing
             named systems would over-claim coverage we don't actually have. */}
          {jobs.length >= 3 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Major {hub.name} healthcare systems</h2>
              <p className="text-sm text-gray-700 leading-relaxed">
                {hub.topEmployers.join(', ')}. Some listings come from these systems directly; others are placed by our recruiter book.
              </p>
            </div>
          )}

          {/* By-city linkbar (only if multiple cities) */}
          {cities.length > 1 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 self-center mr-2">By city:</span>
              {cities.map((c) => (
                <Link
                  key={c}
                  href={`/jobs?state=${encodeURIComponent(hub.abbr)}&q=${encodeURIComponent(c)}`}
                  className="text-xs border border-black px-2 py-1 hover:bg-black hover:text-white"
                >
                  {c} ({jobs.filter((j) => j.city === c).length})
                </Link>
              ))}
            </div>
          )}

          {/* In-demand specialties in state */}
          {topSpecialties.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">In-demand specialties in {hub.name}</h2>
              <div className="flex flex-wrap gap-2">
                {topSpecialties.map(([s, n]) => (
                  <span key={s} className="text-xs bg-gray-100 px-2 py-1">{s} ({n})</span>
                ))}
              </div>
            </div>
          )}

          {/* Computed salary panel — aggregated from active job inventory with
              published salary ranges. Plain HTML for AI Overview citability;
              no Occupation/EstimatedSalary schema (deprecated Sept 2025). */}
          {salaryOverall && (
            <section className="mb-10 max-w-3xl">
              <h2 className="text-2xl font-black tracking-tight mb-2">
                Typical {hub.name} healthcare salaries
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Based on {salaryOverall.count} active {hub.name} role{salaryOverall.count === 1 ? '' : 's'} on freejobpost.co with published salary ranges. Typical pay: {fmtUsdCompact(salaryOverall.low)}–{fmtUsdCompact(salaryOverall.high)} (median {fmtUsdCompact(salaryOverall.avg)} per year).
              </p>
              {salaryByBucket.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-2 border-black">
                    <thead className="bg-gray-100 text-left">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-bold">Specialty / Role</th>
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
              <p className="text-xs text-gray-500 mt-2">
                Salary ranges are pulled from real published listings on freejobpost.co. Some roles publish a range, others don&apos;t; the table reflects only roles with both a floor and ceiling.
              </p>
            </section>
          )}

          {jobs.length === 0 ? (
            <div className="border-2 border-black p-8 text-center">
              <p className="text-lg font-bold mb-2">No active {hub.name} healthcare jobs right now.</p>
              <p className="text-gray-700 mb-4">{hub.name} inventory is still ramping up on freejobpost.co. Browse our active national board in the meantime, or set up a candidate match alert.</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href="/jobs" className="inline-block bg-green-700 text-white font-bold px-6 py-2 hover:bg-green-600">Browse all jobs →</Link>
                <a href="https://www.freeresumepost.co" className="inline-block border-2 border-black font-bold px-6 py-2 hover:bg-black hover:text-white">Get matched →</a>
              </div>
            </div>
          ) : (
            <>
              {jobs.length < 3 && (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 mb-6">
                  <p className="text-sm text-gray-800">
                    <span className="font-bold">Limited inventory in {hub.name} right now.</span>{' '}
                    Showing {jobs.length} active role{jobs.length === 1 ? '' : 's'}. Most of our open positions are concentrated in higher-density states —{' '}
                    <Link href="/jobs" className="underline font-medium hover:text-green-700">see all healthcare jobs</Link>.
                  </p>
                </div>
              )}
              <ul className="border-t-2 border-black">
              {jobs.map((j) => (
                <li key={j.id} className="border-b border-black/10 py-5">
                  <Link href={`/jobs/${j.slug}`} className="group block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black tracking-tight group-hover:text-green-700 mb-1">{j.title}</h2>
                        <p className="text-sm text-gray-700">
                          {locationLabel(j)} · {employmentLabel(j.employment_type)}
                          {j.remote_hybrid ? ` · ${remoteLabel(j.remote_hybrid)}` : ''}
                          {j.specialty ? ` · ${j.specialty}` : ''}
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
            </>
          )}

          {/* Other states — internal linking */}
          <h2 className="text-2xl font-black tracking-tight mt-16 mb-4">Healthcare jobs in other states</h2>
          <div className="flex flex-wrap gap-2 mb-8">
            {STATE_HUBS.filter((s) => s.slug !== hub.slug).map((s) => (
              <Link
                key={s.slug}
                href={`/state/${s.slug}`}
                className="text-sm border-2 border-black px-3 py-1.5 hover:bg-black hover:text-white font-medium"
              >
                {s.name}
              </Link>
            ))}
          </div>

          {/* Specialties cross-link */}
          <h2 className="text-2xl font-black tracking-tight mt-12 mb-4">Browse by specialty</h2>
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_HUBS.map((s) => (
              <Link
                key={s.slug}
                href={`/specialty/${s.slug}`}
                className="text-sm border border-black/40 px-3 py-1.5 hover:bg-black hover:text-white"
              >
                {s.title.replace(/ Jobs$/, '')}
              </Link>
            ))}
          </div>
        </article>
      </main>
    </>
  )
}
