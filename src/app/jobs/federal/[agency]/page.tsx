import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import { safeJsonLd } from '@/lib/safe-jsonld'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import {
  FEDERAL_AGENCIES,
  findAgencyBySlug,
  agencyOrFilter,
} from '@/lib/federal-agencies'
import { getViableFederalCellsCached } from '@/lib/federal-state-matrix'
import JobAlertCapture from '@/components/JobAlertCapture'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'

// 2026-05-28 cost pass: 300s → 1h → 6h, matching the sibling specialty/
// state/city hubs (21600s). Federal inventory changes on the 4h ingest cron,
// so 6h is plenty fresh. See jobs/[slug] for rationale.
export const revalidate = 86400

// Pre-render all known agency landing pages at build time. Adding a new agency
// is a single config-list edit in src/lib/federal-agencies.ts.
export function generateStaticParams() {
  return FEDERAL_AGENCIES.map((a) => ({ agency: a.slug }))
}

// Force 404 for unknown agency slugs rather than runtime-fetching.
export const dynamicParams = false

export async function generateMetadata(
  { params }: { params: Promise<{ agency: string }> },
): Promise<Metadata> {
  const { agency: slug } = await params
  const agency = findAgencyBySlug(slug)
  if (!agency) return { title: 'Federal healthcare jobs' }
  const canonical = `https://freejobpost.co/jobs/federal/${agency.slug}`
  return {
    // Root layout adds " | Free Job Post" via title.template — don't repeat.
    title: `${agency.fullName} healthcare jobs`,
    description: `${agency.blurb} Open positions sourced from USAJobs, refreshed every 4 hours. Apply directly via the federal application portal.`,
    alternates: { canonical },
    openGraph: {
      title: `${agency.fullName} healthcare jobs`,
      description: agency.blurb,
      url: canonical,
      type: 'website',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${agency.fullName} healthcare jobs`,
      description: agency.blurb,
      images: ['/opengraph-image'],
    },
  }
}

export default async function AgencyJobsPage(
  { params }: { params: Promise<{ agency: string }> },
) {
  const { agency: slug } = await params
  const agency = findAgencyBySlug(slug)
  if (!agency) notFound()

  const nowIso = hourIso()
  // Three parallel queries:
  //  - rendered list of agency-matching jobs (capped at 500 — agency hubs are
  //    narrower than the global /jobs index so a smaller cap is fine)
  //  - the total count, for an honest header badge
  //  - the agency's state-matrix cells, so we can render in-page links to the
  //    /jobs/federal/[agency]/[state] leaves (≥5 jobs per cell) — gives crawlers
  //    a discovery path and gives users a fast state filter
  const allCells = await getViableFederalCellsCached(supabase)
  const stateCells = allCells
    .filter((c) => c.agency.slug === agency.slug)
    .sort((a, b) => b.count - a.count)
  const [jobsRes, countRes] = await Promise.all([
    supabase
      .from('public_jobs')
      .select(JOB_LIST_FIELDS)
      .eq('source', 'usajobs:federal')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .or(agencyOrFilter(agency))
      .order('updated_at', { ascending: false })
      .limit(500),
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'usajobs:federal')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
      .or(agencyOrFilter(agency)),
  ])

  const jobs: PublicJob[] = (jobsRes.data ?? []) as PublicJob[]
  const totalCount = countRes.count ?? jobs.length

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
    ],
  }

  // ItemList JSON-LD: typed list of agency-specific jobs so Google
  // treats this as a category page. URL + name only (no employer
  // override — the agency is the employer for these federal roles
  // but the per-job JobPosting JSON-LD already nails that). Capped
  // at 30 entries (Google ignores past ~30).
  const itemListJsonLd = jobs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${agency.fullName} healthcare jobs`,
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
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-lg sm:text-xl tracking-tight">
                freejobpost<span className="text-green-700">.co</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
                BETA
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-green-700">
                Browse jobs
              </Link>
              <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-green-700">
                For candidates
              </a>
              <Link
                href="/post-job"
                className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
              >
                Post a job →
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 pt-6 text-xs text-gray-500">
          <Link href="/" className="hover:text-green-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-green-700">Jobs</Link>
          <span className="mx-2">/</span>
          <Link href="/jobs/federal" className="hover:text-green-700">Federal</Link>
          <span className="mx-2">/</span>
          <span className="text-black">{agency.name}</span>
        </div>

        <section className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-green-600" />
              {totalCount.toLocaleString()} {agency.name.toUpperCase()} ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              {agency.fullName}
              <br />
              <span className="text-green-700">Healthcare jobs.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-3xl text-gray-700">{agency.blurb}</p>
            <p className="mt-4 text-sm text-gray-500">
              Sourced from USAJobs; apply links route directly to the federal
              application portal. Refreshed every 4 hours.
            </p>
          </div>
        </section>

        {/* State-cell quick links — only states with ≥5 active jobs for this
            agency are rendered (the same threshold that powers
            /jobs/federal/[agency]/[state] static-param generation). Gives
            crawlers a clean discovery path to the matrix leaves and gives
            users a one-click state filter without leaving the agency hub. */}
        {stateCells.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pt-10">
            <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
              BROWSE {agency.name.toUpperCase()} BY STATE
            </h2>
            <div className="flex flex-wrap gap-2">
              {stateCells.map((c) => (
                <Link
                  key={c.state.slug}
                  href={`/jobs/federal/${agency.slug}/${c.state.slug}`}
                  className="inline-flex items-baseline gap-1.5 border-2 border-black px-3 py-1.5 text-sm font-bold hover:bg-green-50 transition-colors"
                >
                  <span>{c.state.name}</span>
                  <span className="text-xs text-gray-500 font-normal tabular-nums">
                    {c.count.toLocaleString()}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="max-w-6xl mx-auto px-6 py-10">
          {jobs.length === 0 ? (
            <div className="py-12 text-center border-2 border-black bg-gray-50">
              <p className="text-lg font-bold mb-2">
                No active {agency.name} listings right now.
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Federal job postings move fast. Check back later or browse other agencies.
              </p>
              <Link
                href="/jobs/federal"
                className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
              >
                ← All federal agencies
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold">
                  {totalCount.toLocaleString()}{' '}
                  {totalCount === 1 ? 'role' : 'roles'}
                  {jobs.length < totalCount && ` · showing ${jobs.length}`}
                </p>
              </div>
              <ul className="divide-y-2 divide-black border-y-2 border-black">
                {jobs.map((job) => {
                  const loc = locationLabel(job)
                  const sal = formatSalary(job.salary_min, job.salary_max)
                  const rem = remoteLabel(job.remote_hybrid)
                  const emp = employmentLabel(job.employment_type)
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.slug}`}
                        className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors"
                      >
                        <div className="col-span-12 md:col-span-5">
                          <div className="font-bold">
                            <span className="truncate">{job.title || job.role}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                            {emp && <span>{emp}</span>}
                            {rem && rem !== 'Onsite' && (
                              <span className="text-green-700 font-bold">{rem}</span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-3 text-gray-700 self-center">
                          {loc || '—'}
                        </div>
                        <div className="col-span-6 md:col-span-2 text-gray-700 text-sm self-center">
                          {job.specialty || job.role || ''}
                        </div>
                        <div className="col-span-12 md:col-span-2 font-bold text-right self-center">
                          {sal || ''}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {jobs.length < totalCount && (
                <p className="mt-6 text-center text-sm text-gray-500">
                  Showing first {jobs.length.toLocaleString()} of{' '}
                  {totalCount.toLocaleString()} {agency.name} jobs. Use the main{' '}
                  <Link href="/jobs" className="underline hover:text-green-700">
                    job search
                  </Link>{' '}
                  to filter further by state, role, or remote.
                </p>
              )}
            </>
          )}
        </section>

        {/* Job-alert capture — federal roles apply out via the USAJobs portal,
            so the on-site funnel otherwise dead-ends here. Convert the browser
            into a re-contactable CRM lead. Generic healthcare alert (no
            defaultSpecialty — agency hubs span every specialty/state, and a
            non-specialty string would pollute the digest's specialty matching).
            source='federal_agency' (free-text subscribers.source, no CHECK). */}
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <div className="max-w-3xl">
            <div className="mb-8">
              <ResumeMatchCTA />
            </div>
            <JobAlertCapture source="federal_agency" />
          </div>
        </section>
      </main>
    </>
  )
}
