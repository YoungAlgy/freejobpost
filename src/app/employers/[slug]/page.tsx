// /employers/[slug] — public SEO landing page for a verified healthcare employer.
// Shows the employer's active open roles and a "post here free" CTA.
//
// Route only resolves for:
//   • Verified non-seeded employers (verified_at IS NOT NULL, verified_via != 'seeded')
//   • Employers with at least 1 active job at render time
//
// Seeded Ava-Health-Partners roles are deliberately excluded — those go through
// the disclosure footer on individual job pages instead.
//
// Static params pre-generate pages for every qualified employer at build time;
// dynamicParams = true handles new signups between deploys (on-demand ISR).

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  locationLabel,
  remoteLabel,
  employmentLabel,
} from '@/lib/public-jobs'
import VerifiedEmployerBadge from '@/components/VerifiedEmployerBadge'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const revalidate = 600
// Allow on-demand rendering for employers that sign up after the last build
export const dynamicParams = true

type Props = { params: Promise<{ slug: string }> }

// Slug validation — matches slugify_employer_name() SQL output
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/

type EmployerRow = {
  id: string
  company_name: string
  company_url: string | null
  vertical: string | null
  verified_at: string | null
  verified_via: string | null
  slug: string
  tier: string | null
}

async function getEmployer(slug: string): Promise<EmployerRow | null> {
  if (!SLUG_RE.test(slug)) return null
  const { data } = await supabase
    .from('public_employers_directory')
    .select('id, company_name, company_url, vertical, verified_at, verified_via, slug, tier')
    .eq('slug', slug)
    .maybeSingle()
  const row = data as EmployerRow | null
  if (!row) return null
  // Exclude Ava-seeded inventory — those don't get a public employer page
  if (row.verified_via === 'seeded') return null
  if (/^ava health partners\b/i.test(row.company_name)) return null
  return row
}

async function getEmployerJobs(employerId: string): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('employer_id', employerId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as PublicJob[]
}

// Pre-generate pages for every verified non-seeded employer at build time
export async function generateStaticParams() {
  const { data } = await supabase
    .from('public_employers_directory')
    .select('slug, verified_via, company_name')
    .not('verified_at', 'is', null)
  const rows = (data ?? []) as Array<{
    slug: string
    verified_via: string | null
    company_name: string
  }>
  return rows
    .filter(
      (r) =>
        r.slug &&
        r.verified_via !== 'seeded' &&
        !/^ava health partners\b/i.test(r.company_name)
    )
    .map((r) => ({ slug: r.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const employer = await getEmployer(slug)
  if (!employer) return { robots: { index: false, follow: false } }
  return {
    title: `${employer.company_name} — open healthcare jobs`,
    description: `Browse open healthcare positions at ${employer.company_name}. Apply free on freejobpost.co — no account required, no fees.`,
    alternates: { canonical: `https://freejobpost.co/employers/${slug}` },
    openGraph: {
      title: `${employer.company_name} healthcare jobs`,
      description: `Browse open positions at ${employer.company_name}.`,
      url: `https://freejobpost.co/employers/${slug}`,
      type: 'website',
    },
  }
}

export default async function EmployerPage({ params }: Props) {
  const { slug } = await params
  const employer = await getEmployer(slug)
  if (!employer) notFound()

  const jobs = await getEmployerJobs(employer.id)
  if (jobs.length === 0) notFound()

  // Derive display metadata from the job set
  const states = Array.from(new Set(jobs.map((j) => j.state).filter(Boolean))).sort()
  const roles = Array.from(new Set(jobs.map((j) => j.role).filter(Boolean))).sort()

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Employers',
        item: 'https://freejobpost.co/employers',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: employer.company_name,
        item: `https://freejobpost.co/employers/${slug}`,
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <main className="min-h-screen bg-white text-gray-900 font-sans">
        {/* Nav */}
        <nav className="border-b-2 border-black">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="font-black tracking-tight text-xl">
              freejobpost<span className="text-gray-400">.co</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/jobs" className="hover:text-green-700">
                Browse jobs
              </Link>
              <Link
                href="/post-job"
                className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
              >
                Post a job
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-5xl mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <nav className="text-xs text-gray-500 mb-6" aria-label="breadcrumb">
            <Link href="/" className="hover:text-black">
              Home
            </Link>
            {' / '}
            <Link href="/employers" className="hover:text-black">
              Employers
            </Link>
            {' / '}
            <span className="text-gray-900 font-medium">{employer.company_name}</span>
          </nav>

          {/* Employer header */}
          <header className="border-b-2 border-black pb-8 mb-10">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-4xl font-black tracking-tight leading-tight">
                {employer.company_name}
              </h1>
              {employer.verified_at && <VerifiedEmployerBadge />}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
              {employer.company_url && (
                <a
                  href={employer.company_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black underline underline-offset-2"
                >
                  {employer.company_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )}
              {employer.vertical && <span>{employer.vertical}</span>}
              {states.length > 0 && <span>{states.join(' · ')}</span>}
            </div>

            {/* Opening count + specialty summary */}
            <p className="mt-4 text-base text-gray-700">
              <strong>{jobs.length}</strong> open{' '}
              {jobs.length === 1 ? 'role' : 'roles'} on freejobpost.co
              {roles.length > 0 && (
                <>
                  {' '}
                  &mdash;{' '}
                  {roles.slice(0, 5).join(', ')}
                  {roles.length > 5 ? `, +${roles.length - 5} more` : ''}
                </>
              )}
            </p>
          </header>

          {/* Job listings table */}
          <section aria-label="Open positions">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Open positions at {employer.company_name}
            </h2>
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
                      className="grid grid-cols-12 gap-x-4 gap-y-1 py-4 hover:bg-green-50 transition-colors"
                    >
                      {/* Title */}
                      <div className="col-span-12 md:col-span-6 font-bold text-sm md:text-base">
                        {job.title}
                      </div>
                      {/* Location / remote */}
                      <div className="col-span-6 md:col-span-3 text-gray-700 text-sm self-center">
                        {rem === 'Remote' ? (
                          <span className="inline-block bg-green-100 text-green-800 text-[11px] font-bold px-2 py-0.5">
                            Remote
                          </span>
                        ) : rem === 'Hybrid' ? (
                          <>
                            <span className="inline-block bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 mr-1">
                              Hybrid
                            </span>
                            {loc}
                          </>
                        ) : (
                          loc || '—'
                        )}
                      </div>
                      {/* Employment type */}
                      <div className="col-span-6 md:col-span-2 text-gray-500 text-sm self-center">
                        {emp || ''}
                      </div>
                      {/* Salary — full width on mobile (matches /jobs list pattern) */}
                      <div className="col-span-12 md:col-span-1 font-bold text-right text-sm self-center text-green-700">
                        {sal || ''}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* Post-job CTA */}
          <div className="mt-16 border-2 border-black p-8">
            <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">
              For employers
            </p>
            <h2 className="text-2xl font-black mb-4">
              Post your open roles free — no auction, no per-applicant fee.
            </h2>
            <p className="text-gray-700 mb-6 leading-relaxed max-w-xl">
              freejobpost.co is a free healthcare job board. Listings go into public XML feeds
              picked up by aggregators, plus a candidate-side matching engine at freeresumepost.co.
              No credit card required.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/post-job"
                className="inline-block bg-black text-white font-bold px-6 py-3 hover:bg-green-700 transition-colors"
              >
                Post a job →
              </Link>
              <Link
                href="/for-employers"
                className="inline-block border-2 border-black font-bold px-6 py-3 hover:bg-black hover:text-white transition-colors"
              >
                How it works
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
