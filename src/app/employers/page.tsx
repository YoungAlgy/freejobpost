// /employers — directory of verified healthcare employers on freejobpost.co.
// Lists every non-seeded verified employer alphabetically with a link to
// their employer page and an active job count. Thin page today (0 real
// employers during cold-start), grows automatically as Phase 1 onboarding
// progresses.

import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import { safeJsonLd } from '@/lib/safe-jsonld'

// 2026-05-28: 600s → 21600s (6h). ISR cost audit — see jobs/[slug].
export const revalidate = 21600

export const metadata: Metadata = {
  title: 'Healthcare employers hiring',
  description:
    'Verified healthcare employers currently hiring on freejobpost.co. Browse open roles by organization — free to apply, no account required.',
  alternates: { canonical: 'https://freejobpost.co/employers' },
  openGraph: {
    title: 'Healthcare employers — freejobpost.co',
    description: 'Verified healthcare employers currently hiring on freejobpost.co.',
    url: 'https://freejobpost.co/employers',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthcare employers — freejobpost.co',
    description: 'Verified healthcare employers currently hiring on freejobpost.co.',
    images: ['/opengraph-image'],
  },
}

type EmployerRow = {
  id: string
  company_name: string
  company_url: string | null
  vertical: string | null
  verified_at: string | null
  verified_via: string | null
  slug: string
}

export default async function EmployersPage() {
  // Fetch verified non-seeded employers from the directory view
  const { data } = await supabase
    .from('public_employers_directory')
    .select('id, company_name, company_url, vertical, verified_at, verified_via, slug')
    .not('verified_at', 'is', null)
    .order('company_name')

  const allRows = (data ?? []) as EmployerRow[]
  // Exclude Ava-seeded inventory + ATS-imported employers. The latter have
  // legitimate jobs (Oscar, Lyra, etc.) on our site, but we don't have a
  // verified business relationship with them — their jobs are sourced from
  // the public Greenhouse/Lever board APIs. Keeping them out of the directory
  // prevents the appearance of an Ava-branded company page for Oscar Health.
  const employers = allRows.filter(
    (r) =>
      r.verified_via !== 'seeded' &&
      r.verified_via !== 'ats_import' &&
      !/^ava health partners\b/i.test(r.company_name)
  )

  // For each employer, get their active job count
  const counts: Record<string, number> = {}
  if (employers.length > 0) {
    const ids = employers.map((e) => e.id)
    const { data: jobData } = await supabase
      .from('public_jobs')
      .select('employer_id')
      .in('employer_id', ids)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', hourIso())
    for (const row of (jobData ?? []) as Array<{ employer_id: string }>) {
      counts[row.employer_id] = (counts[row.employer_id] ?? 0) + 1
    }
  }

  // Only show employers that have at least 1 active job right now
  const active = employers.filter((e) => (counts[e.id] ?? 0) > 0)

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
              <Link href="/jobs" className="hidden sm:inline hover:text-green-700">
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
            <span className="text-gray-900 font-medium">Employers</span>
          </nav>

          <h1 className="text-4xl font-black tracking-tight mb-2">
            Healthcare employers hiring now
          </h1>
          <p className="text-gray-600 mb-10 leading-relaxed">
            Verified healthcare employers currently posting on freejobpost.co. Browse by
            organization — free to apply, no account required.
          </p>

          {active.length === 0 ? (
            /* Empty state during cold-start — honest, not alarming */
            <div className="border-2 border-black p-10 text-center">
              <p className="text-xl font-black mb-3">Building our employer network</p>
              <p className="text-gray-600 mb-6 max-w-lg mx-auto">
                We&apos;re onboarding direct healthcare employer postings now. In the
                meantime,{' '}
                <Link href="/jobs" className="underline hover:text-green-700">
                  browse all active openings
                </Link>{' '}
                where every listing has a real apply link.
              </p>
              <Link
                href="/post-job"
                className="inline-block bg-black text-white font-bold px-6 py-3 hover:bg-green-700 transition-colors"
              >
                Post your roles free →
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
                {active.length} verified {active.length === 1 ? 'employer' : 'employers'}
              </p>
              <ul className="divide-y-2 divide-black border-y-2 border-black">
                {active.map((employer) => {
                  const jobCount = counts[employer.id] ?? 0
                  return (
                    <li key={employer.id}>
                      <Link
                        href={`/employers/${employer.slug}`}
                        className="flex items-center justify-between gap-4 py-4 px-2 hover:bg-green-50 transition-colors"
                      >
                        <div>
                          <span className="font-bold">{employer.company_name}</span>
                          {employer.vertical && (
                            <span className="ml-3 text-xs text-gray-500">
                              {employer.vertical}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-green-700 shrink-0">
                          {jobCount} open {jobCount === 1 ? 'role' : 'roles'} →
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Always-on CTA */}
          <div className="mt-16 border-t-2 border-black pt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-gray-600">
              Healthcare employer?{' '}
              <Link href="/post-job" className="font-bold underline hover:text-green-700">
                Post your open roles free
              </Link>{' '}
              — no credit card, no auction, no paywall to see applicants.
            </p>
            <Link
              href="/for-employers"
              className="text-sm font-bold underline underline-offset-2 hover:text-green-700 shrink-0"
            >
              How it works →
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
