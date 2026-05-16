import Link from 'next/link'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import JobsFilter from './jobs-filter'

import { safeJsonLd } from '@/lib/safe-jsonld'
export const metadata: Metadata = {
  title: 'Healthcare jobs — free to browse, free to apply',
  description:
    'Browse hundreds of healthcare jobs — physicians, nurses, therapists, locum, per-diem roles. Free to browse, free to apply. No account required.',
  alternates: { canonical: 'https://freejobpost.co/jobs' },
  openGraph: {
    title: 'Healthcare jobs — freejobpost.co',
    description: 'Hundreds of healthcare jobs, free to browse and apply.',
    url: 'https://freejobpost.co/jobs',
    type: 'website',
  },
}

export const revalidate = 300

export default async function JobsIndexPage() {
  // Fetch jobs, the total count, and the verified-employer ID set in parallel.
  //
  // - jobsRes (two batches): the actual rendered list. Ordering by updated_at
  //   (not created_at) keeps any single big ingest (e.g. the +2,361 USAJobs
  //   federal jobs from the 2026-05-16 v12 deploy) from monopolising the top
  //   of the list — every 4h cron tick re-touches Workday/Greenhouse/Lever
  //   rows, bubbling them back into the top window. Fetched as two parallel
  //   .range() batches of 1,000 because Supabase's anon-role PostgREST cap is
  //   1,000 rows per query (`pgrst.db_max_rows=1000`), so a single .limit(2000)
  //   silently clamps. Two batches gets us ~25% of inventory; client filter
  //   component paginates 50-at-a-time with a "Show more" button.
  // - countRes: gives the honest total for the "OPEN ROLES" badge, decoupled
  //   from how many we actually rendered. Without this the badge said "500"
  //   even when the DB had 8,000+ active jobs.
  // - verifiedRes: surfaces the verified pool as a filter pill in JobsFilter.
  const nowIso = new Date().toISOString()
  const baseJobs = () => supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .order('updated_at', { ascending: false })
  const [jobsBatch1, jobsBatch2, countRes, verifiedRes] = await Promise.all([
    baseJobs().range(0, 999),
    baseJobs().range(1000, 1999),
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso),
    supabase
      .from('public_employers_directory')
      .select('id')
      .not('verified_at', 'is', null)
      // Exclude seeded Ava inventory + ATS imports — "verified" should only
      // mean a real third-party employer confirmed via domain email. Seeded
      // jobs are placeholders during cold-start; ATS imports are Greenhouse/
      // Lever public-feed pulls where we don't have an employer relationship.
      // Without these filters, the "VERIFIED ONLY" pill + green checks would
      // appear on jobs that don't carry that trust signal (S7 honesty).
      // company_name guard is defence-in-depth in case verified_via gets reset.
      .not('verified_via', 'in', '(seeded,ats_import)')
      .not('company_name', 'ilike', 'Ava Health%'),
  ])

  const jobs: PublicJob[] = ([
    ...((jobsBatch1.data ?? []) as PublicJob[]),
    ...((jobsBatch2.data ?? []) as PublicJob[]),
  ])
  const totalActive: number = countRes.count ?? jobs.length
  const verifiedEmployerIds: string[] = (
    (verifiedRes.data ?? []) as Array<{ id: string }>
  ).map((row) => row.id)

  // Unique filter values derived from the result set
  const roles = Array.from(
    new Set(jobs.map((j) => j.role?.trim()).filter((r): r is string => !!r))
  ).sort()
  const states = Array.from(
    new Set(jobs.map((j) => j.state?.trim()).filter((s): s is string => !!s))
  ).sort()

  // NOTE: JobPosting JSON-LD is intentionally NOT emitted here.
  // Each individual /jobs/[slug] page emits accurate per-job JSON-LD with
  // the correct hiringOrganization pulled from the DB. Emitting JobPosting
  // JSON-LD on this listing page with a hardcoded org ('freejobpost.co' is
  // a job board, not a hiring organization) would fail Google's Rich Results
  // validation and misattribute real-employer roles.

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <main className="min-h-screen bg-white text-black">
        {/* Nav */}
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-xl tracking-tight">
                freejobpost<span className="text-green-700">.co</span>
              </span>
              <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
                BETA
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700 border-b-2 border-black">
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

        {/* Header */}
        <section className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-green-600" />
              {totalActive.toLocaleString()} OPEN ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              Healthcare jobs.
              <br />
              <span className="text-green-700">Free to apply.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl text-gray-700">
              Browse open roles. No account required.
              Apply directly — no middleman.
            </p>
          </div>
        </section>

        {/* Filter + list — wrapped in Suspense because JobsFilter uses
           useSearchParams to initialize from URL params (deep-linkable). */}
        <section className="max-w-6xl mx-auto px-6 py-10">
          <Suspense fallback={<div className="h-32" aria-hidden="true" />}>
            <JobsFilter
              jobs={jobs}
              roles={roles}
              states={states}
              verifiedEmployerIds={verifiedEmployerIds}
            />
          </Suspense>
        </section>

        {/* Empty-state safeguard */}
        {jobs.length === 0 && (
          <section className="max-w-6xl mx-auto px-6 py-20 text-center">
            <p className="text-2xl font-bold mb-3">No open jobs yet.</p>
            <p className="text-gray-600 mb-6">
              Jobs are being verified. Check back in a few hours, or post one yourself.
            </p>
            <Link
              href="/post-job"
              className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
          </section>
        )}
      </main>
    </>
  )
}

// Re-export for internal reference — not actually used here, but guarantees
// the type stays in sync with the filter client component.
export type { PublicJob }

// Helpers used by JobsFilter via props — re-exported to satisfy the client/server split
export { formatSalary, employmentLabel, remoteLabel, locationLabel }
