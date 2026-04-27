import Link from 'next/link'
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

export const metadata: Metadata = {
  title: 'Healthcare jobs — free to browse, free to apply',
  description:
    'Browse hundreds of healthcare jobs from verified employers. Physicians, nurses, therapists, locum, per-diem. No account required to browse. Apply directly.',
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
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(500)

  const jobs: PublicJob[] = (data ?? []) as PublicJob[]

  // Unique filter values derived from the result set
  const roles = Array.from(
    new Set(jobs.map((j) => j.role?.trim()).filter((r): r is string => !!r))
  ).sort()
  const states = Array.from(
    new Set(jobs.map((j) => j.state?.trim()).filter((s): s is string => !!s))
  ).sort()

  // JSON-LD for the top 10 jobs on the index (Google Jobs discovery)
  const topJobsJsonLd = jobs.slice(0, 10).map((job) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title || job.role,
    datePosted: job.created_at?.split('T')[0],
    description: (job.title || job.role || 'Healthcare role') + '. Apply at freejobpost.co.',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'freejobpost.co',
      sameAs: 'https://freejobpost.co',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || undefined,
        addressRegion: job.state || undefined,
        addressCountry: 'US',
      },
    },
    url: `https://freejobpost.co/jobs/${job.slug}`,
  }))

  return (
    <>
      {topJobsJsonLd.map((jld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jld) }}
        />
      ))}
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
            <div className="hidden md:flex items-center gap-8 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700 border-b-2 border-black">
                Browse jobs
              </Link>
              <a href="https://www.freeresumepost.co" className="hover:text-green-700">
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
              {jobs.length} OPEN ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              Healthcare jobs.
              <br />
              <span className="text-green-700">Free to apply.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-2xl text-gray-700">
              Browse open roles from verified employers. No account required.
              Apply directly — no middleman.
            </p>
          </div>
        </section>

        {/* Filter + list */}
        <section className="max-w-6xl mx-auto px-6 py-10">
          <JobsFilter jobs={jobs} roles={roles} states={states} />
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
