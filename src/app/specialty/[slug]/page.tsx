// /specialty/[slug] — SEO hub page listing jobs filtered by specialty.
// One page per common specialty (cardiology, ortho, hospitalist, RN,
// CRNA, etc.) so each ranks individually for "[specialty] jobs" queries.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import { SPECIALTY_HUBS, getSpecialtyHub } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CAREER_PATHS } from '@/lib/career-paths'
import { getViableCellsCached } from '@/lib/specialty-state-matrix'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'
import { composeHubMetaDescription } from '@/lib/hub-meta-description'
import {
  aggregateSalariesByGroup,
  aggregateSalariesOverall,
  fmtUsdCompact,
} from '@/lib/salary-aggregates'
import { stripSalarySuffix } from '@/lib/clean-labels'

import { safeJsonLd } from '@/lib/safe-jsonld'
import JobAlertCapture from '@/components/JobAlertCapture'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'

// Slugs that exist on BOTH freejobpost and freeresumepost specialty hubs.
// When the current hub is in this set, the cross-link points to the matching
// specialty hub on the sister site instead of the homepage. Bidirectional
// authority transfer + better-matched candidate flow.
const BRIDGED_SPECIALTY_SLUGS = new Set([
  'registered-nurse',
  'crna',
  'nurse-practitioner',
  'pharmacist',
  'physician-assistant',
])

// 2026-05-28: 600s → 21600s (6h). ISR cost audit — listing pages only
// change when jobs are added (4h ingest cron), so 6h is fresh enough and
// cuts crawler-driven regen 36×. See jobs/[slug] for full rationale.
export const revalidate = 21600

export async function generateStaticParams() {
  return SPECIALTY_HUBS.map((s) => ({ slug: s.slug }))
}

// Filter-build moved to src/lib/specialty-filter.ts + unit-tested with
// regression guards against the 2026-05-22 PostgREST .or() double-
// encoding bug (commit 6e2b839). Two consumers (this file +
// /specialty/[slug]/[state]/page.tsx) used to keep their own inline
// copies, which is how the bug landed in the first place. The shared
// helper + tests stop that recurrence.
const buildHubOrFilter = buildSpecialtyOrFilter

async function fetchJobCountForSpecialty(matchPatterns: string[]): Promise<number> {
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(buildHubOrFilter(matchPatterns))
  return count ?? 0
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const hub = getSpecialtyHub(slug)
  if (!hub) return {}
  const count = await fetchJobCountForSpecialty(hub.matchPatterns)
  const description = composeHubMetaDescription({
    count,
    staticDescription: hub.metaDescription,
    label: hub.title,
    kind: 'specialty',
  })
  return {
    title: hub.title,
    description,
    alternates: {
      canonical: `https://freejobpost.co/specialty/${hub.slug}`,
      // RSS alternate so feed-reader browser extensions auto-discover
      // the per-specialty filtered feed at /feeds/specialty/<slug>.
      types: {
        'application/rss+xml': `https://freejobpost.co/feeds/specialty/${hub.slug}`,
      },
    },
    openGraph: {
      title: `${hub.title} | freejobpost.co`,
      description,
      url: `https://freejobpost.co/specialty/${hub.slug}`,
      type: 'website',
    },
  }
}

async function fetchJobsForHub(matchPatterns: string[]): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(buildHubOrFilter(matchPatterns))
    .order('created_at', { ascending: false })
    .limit(300)
  return (data ?? []) as PublicJob[]
}

export default async function SpecialtyHubPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const hub = getSpecialtyHub(slug)
  if (!hub) notFound()

  const jobs = await fetchJobsForHub(hub.matchPatterns)

  // Viable matrix cells for THIS specialty — top state deep-links into the
  // /specialty/[slug]/[state] surface. Internal-linking-mesh layer 2.4: each
  // specialty hub passes authority down to the matrix pages it parents.
  // Top 8 cells by job count.
  const allCells = await getViableCellsCached(supabase)
  const matrixCellsForSpecialty = allCells
    .filter((c) => c.specialty.slug === hub.slug)
    .slice(0, 8)

  // States represented in the result set — used for the "by state" linkbar
  const states = Array.from(
    new Set(jobs.map((j) => j.state?.trim()).filter((s): s is string => !!s))
  ).sort()

  // Salary aggregates broken down by state — answers "[specialty] salary
  // by state" queries. Plain HTML for AI Overview citability; no
  // Occupation/EstimatedSalary schema (deprecated Sept 2025).
  const salaryByState = aggregateSalariesByGroup(
    jobs,
    (j) => j.state?.trim() || null,
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const salaryOverall = aggregateSalariesOverall(jobs)

  // Deep-link to the sister freeresumepost specialty hub when the slug bridges
  // both sites. Otherwise fall back to the freeresumepost homepage.
  const resumeHubUrl = BRIDGED_SPECIALTY_SLUGS.has(hub.slug)
    ? `https://www.freeresumepost.co/specialty/${hub.slug}`
    : 'https://www.freeresumepost.co'

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
      { '@type': 'ListItem', position: 2, name: 'Specialties', item: 'https://freejobpost.co/specialty' },
      { '@type': 'ListItem', position: 3, name: hub.title, item: `https://freejobpost.co/specialty/${hub.slug}` },
    ],
  }

  // ItemList JSON-LD: Google uses this on category/listing pages to
  // understand the page IS a list of related entities, which unlocks
  // category-style SERP treatment + improves understanding of the
  // hub-vs-detail relationship. Lists URL + name only (no employer,
  // salary, or location) — avoids the JobPosting misattribution risk
  // documented above while still giving Google the list shape.
  // Top 30 entries (Google ignores beyond ~30 anyway).
  const itemListJsonLd = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${hub.title} on freejobpost.co`,
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

        <article className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
            <Link href="/" className="hover:text-green-700">Home</Link>
            {' / '}
            <Link href="/specialty" className="hover:text-green-700">Specialties</Link>
            {' / '}
            <span className="text-black font-medium">{hub.title}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {hub.title} <span className="text-green-700">— {jobs.length}</span>
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed mb-10 max-w-3xl">
            {hub.shortDescription} Free to browse, free to apply, no recruiter spam. Roles are placed by Ava Health Partners&apos; recruiter book or directly by US healthcare employers — every listing has a real apply link.
          </p>

          {/* Conversion bridge → freeresumepost.co, contextual to this
              specialty. High-intent browse page (they searched this specialty),
              so it's the natural place to offer "upload once → get matched". */}
          <div className="mb-10 max-w-3xl">
            <ResumeMatchCTA specialtyLabel={hub.title.replace(/ Jobs$/, '')} />
          </div>

          {/* By-state linkbar for internal linking density */}
          {states.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 self-center mr-2">By state:</span>
              {states.map((s) => (
                <Link
                  key={s}
                  href={`/jobs?state=${encodeURIComponent(s)}`}
                  className="text-xs border border-black px-2 py-1 hover:bg-black hover:text-white"
                >
                  {s} ({jobs.filter((j) => j.state === s).length})
                </Link>
              ))}
            </div>
          )}

          {/* Matrix deep-links — Layer 2.4 internal linking mesh.
              Viable (this-specialty × state) cells, deep-linked into the
              /specialty/[slug]/[state] surface. Each card has ≥5 matching
              jobs (guaranteed by getViableCellsCached) so users land on a
              page with real inventory, not a stub. */}
          {matrixCellsForSpecialty.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Top states for {hub.title.replace(/ Jobs$/, '').toLowerCase()} roles
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {matrixCellsForSpecialty.map((c) => (
                  <Link
                    key={`${c.specialty.slug}-${c.state.slug}`}
                    href={`/specialty/${c.specialty.slug}/${c.state.slug}`}
                    className="flex items-baseline justify-between gap-3 text-sm border-2 border-black px-3 py-2 hover:bg-black hover:text-white"
                  >
                    <span className="font-medium truncate">
                      {hub.title.replace(/ Jobs$/, '')} in {c.state.name}
                    </span>
                    <span className="text-xs tabular-nums opacity-70 shrink-0">{c.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Computed salary panel — aggregated from active job inventory with
              published salary ranges, broken down by state. Plain HTML for
              AI Overview citability; no Occupation/EstimatedSalary schema. */}
          {salaryOverall && (
            <section className="mb-10 max-w-3xl">
              <h2 className="text-2xl font-black tracking-tight mb-2">
                {hub.title.replace(/ Jobs$/, '')} salaries by state
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">
                Based on {salaryOverall.count} active {hub.title.toLowerCase().replace(/ jobs$/, '')} role{salaryOverall.count === 1 ? '' : 's'} on freejobpost.co with published salary ranges. Typical pay: {fmtUsdCompact(salaryOverall.low)}-{fmtUsdCompact(salaryOverall.high)} (median {fmtUsdCompact(salaryOverall.avg)} per year).
              </p>
              {salaryByState.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-2 border-black">
                    <thead className="bg-gray-100 text-left">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-bold">State</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Roles</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Typical pay</th>
                        <th scope="col" className="px-3 py-2 font-bold text-right">Median</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10">
                      {salaryByState.map((row) => (
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
              <p className="text-xs text-gray-500 mt-2">
                Salary ranges are pulled from real published listings on freejobpost.co. Some roles publish a range, others don&apos;t; the table reflects only roles with both a floor and ceiling.
              </p>
            </section>
          )}

          {jobs.length === 0 ? (
            <div className="border-2 border-black p-8 text-center">
              <p className="text-lg font-bold mb-2">No active {hub.title.toLowerCase()} right now.</p>
              <p className="text-gray-700 mb-4">This specialty&apos;s inventory is still ramping up on freejobpost.co. Browse the full national board in the meantime, or upload your resume so we can match you the moment a {hub.title.toLowerCase().replace(/ jobs$/, '')} role opens.</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href="/jobs" className="inline-block bg-green-700 text-white font-bold px-6 py-2 hover:bg-green-600">Browse all jobs →</Link>
                <a href={resumeHubUrl} className="inline-block border-2 border-black font-bold px-6 py-2 hover:bg-black hover:text-white">Get matched →</a>
              </div>
            </div>
          ) : (
            <>
              {jobs.length < 3 && (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 mb-6">
                  <p className="text-sm text-gray-800">
                    <span className="font-bold">Limited {hub.title.toLowerCase().replace(/ jobs$/, '')} inventory right now.</span>{' '}
                    Showing {jobs.length} active role{jobs.length === 1 ? '' : 's'}.{' '}
                    <Link href="/jobs" className="underline font-medium hover:text-green-700">See all healthcare jobs</Link>{' '}
                    or{' '}
                    <a href={resumeHubUrl} className="underline font-medium hover:text-green-700">upload your resume</a>{' '}
                    to be matched as new roles open.
                  </p>
                </div>
              )}
              <ul className="border-t-2 border-black">
              {jobs.map((j) => (
                <li key={j.id} className="border-b border-black/10 py-5">
                  <Link href={`/jobs/${j.slug}`} className="group block">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-black tracking-tight group-hover:text-green-700 mb-1">{stripSalarySuffix(j.title) || j.title}</h2>
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
            </>
          )}

          {/* Job-alert capture — converts the passive majority (visitors who
              won't apply on visit 1) into a re-contactable CRM lead tagged with
              this specialty's intent. Shown for both populated and empty
              inventory (empty = the highest-value moment to capture). */}
          <div className="mt-12 max-w-3xl">
            <JobAlertCapture
              defaultSpecialty={hub.title.replace(/ Jobs$/, '')}
              source="specialty_hub"
            />
          </div>

          {/* Other specialties — internal linking */}
          <h2 className="text-2xl font-black tracking-tight mt-16 mb-4">Browse other specialties</h2>
          <div className="flex flex-wrap gap-2 mb-8">
            {SPECIALTY_HUBS.filter((s) => s.slug !== hub.slug).map((s) => (
              <Link
                key={s.slug}
                href={`/specialty/${s.slug}`}
                className="text-sm border-2 border-black px-3 py-1.5 hover:bg-black hover:text-white font-medium"
              >
                {s.title.replace(/ Jobs$/, '')}
              </Link>
            ))}
          </div>

          {/* Career-path guide — cross-link from the specialty hub to
             the matching /become/[slug] guide when one exists. Surfaces
             the upstream "how to become a <role>" content cluster for
             readers researching the path before applying. */}
          {(() => {
            const guide = CAREER_PATHS.find((p) => p.specialtySlug === hub.slug)
            if (!guide) return null
            return (
              <aside className="mt-10 border-2 border-black bg-green-50 p-5">
                <p className="text-xs font-bold tracking-widest text-gray-700 uppercase mb-2">
                  New to this role?
                </p>
                <p className="text-sm text-gray-800 mb-3 leading-relaxed">
                  Read our plain-English guide:{' '}
                  <Link
                    href={`/become/${guide.slug}`}
                    className="font-bold underline hover:text-green-700"
                  >
                    {guide.title}
                  </Link>{' '}
                  — education, licensing, exam, timeline.
                </p>
              </aside>
            )
          })()}

          {/* By state — cross-link the state hubs */}
          <h2 className="text-2xl font-black tracking-tight mt-12 mb-4">{hub.title.replace(/ Jobs$/, '')} by state</h2>
          <div className="flex flex-wrap gap-2">
            {STATE_HUBS.map((s) => (
              <Link
                key={s.slug}
                href={`/state/${s.slug}`}
                className="text-sm border border-black/40 px-3 py-1.5 hover:bg-black hover:text-white"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </article>
      </main>
    </>
  )
}
