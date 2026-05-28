import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { safeJsonLd } from '@/lib/safe-jsonld'
import { FEDERAL_AGENCIES, agencyOrFilter } from '@/lib/federal-agencies'

// 5-min revalidate matches /jobs index. The federal page's content is mostly
// aggregate counts + agency overview blurbs. 2026-05-28: bumped 300s →
// 3600s (1h) in the ISR cost audit — federal inventory changes only on the
// 4h ingest cron, so 1h is plenty fresh. See jobs/[slug] for rationale.
export const revalidate = 3600

export const metadata: Metadata = {
  // The root layout adds " | Free Job Post" via title.template — don't repeat it here.
  title: 'Federal healthcare jobs — VA, IHS, DoD, NIH, HHS',
  description:
    'Browse federal healthcare job openings from the U.S. Department of Veterans Affairs, Indian Health Service, military health (Army, Navy, Air Force), NIH, and HHS agencies (CDC, FDA, CMS). Free to browse, free to apply via USAJobs.',
  alternates: { canonical: 'https://freejobpost.co/jobs/federal' },
  openGraph: {
    title: 'Federal healthcare jobs — freejobpost.co',
    description:
      'VA, IHS, military health, NIH, and HHS healthcare positions in one place. Apply directly via USAJobs.',
    url: 'https://freejobpost.co/jobs/federal',
    type: 'website',
  },
}

export default async function FederalJobsHubPage() {
  // Total active federal headcount (status=active, future expires_at).
  // Per-agency counts run in parallel via the agency's title-ILIKE filter.
  const nowIso = new Date().toISOString()
  const [totalRes, ...agencyResults] = await Promise.all([
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'usajobs:federal')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso),
    ...FEDERAL_AGENCIES.map((agency) =>
      supabase
        .from('public_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'usajobs:federal')
        .eq('status', 'active')
        .is('deleted_at', null)
        .gt('expires_at', nowIso)
        .or(agencyOrFilter(agency))
    ),
  ])

  const totalFederal = totalRes.count ?? 0
  const agencyCounts = FEDERAL_AGENCIES.map((agency, i) => ({
    ...agency,
    count: agencyResults[i].count ?? 0,
  }))

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
      { '@type': 'ListItem', position: 3, name: 'Federal', item: 'https://freejobpost.co/jobs/federal' },
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
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-xl tracking-tight">
                freejobpost<span className="text-green-700">.co</span>
              </span>
              <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
                BETA
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700">
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

        {/* Breadcrumb */}
        <div className="max-w-6xl mx-auto px-6 pt-6 text-xs text-gray-500">
          <Link href="/" className="hover:text-green-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-green-700">Jobs</Link>
          <span className="mx-2">/</span>
          <span className="text-black">Federal</span>
        </div>

        {/* Header */}
        <section className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-green-600" />
              {totalFederal.toLocaleString()} FEDERAL ROLES
            </div>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-4">
              Federal healthcare jobs.
              <br />
              <span className="text-green-700">VA. IHS. DoD. NIH. HHS.</span>
            </h1>
            <p className="text-lg md:text-xl max-w-3xl text-gray-700">
              Open federal healthcare positions from the Department of Veterans
              Affairs, Indian Health Service, military health (Army, Navy, Air
              Force), the National Institutes of Health, and other HHS agencies.
              Sourced directly from USAJobs — apply links go straight to the
              federal application portal.
            </p>
          </div>
        </section>

        {/* Agency cards */}
        <section className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-6">
            BROWSE BY AGENCY
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agencyCounts.map((a) => (
              <Link
                key={a.slug}
                href={`/jobs/federal/${a.slug}`}
                className="border-2 border-black p-6 hover:bg-green-50 transition-colors flex flex-col"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-black text-xl tracking-tight">{a.fullName}</div>
                  <div className="text-sm font-bold text-green-700 shrink-0 ml-4">
                    {a.count.toLocaleString()}{' '}
                    <span className="text-gray-500 font-normal">
                      {a.count === 1 ? 'role' : 'roles'}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{a.blurb}</p>
                <span className="mt-4 text-xs font-bold tracking-wider underline underline-offset-2 self-start hover:text-green-700">
                  Browse {a.name} jobs →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Methodology note */}
        <section className="max-w-6xl mx-auto px-6 pb-16 text-sm text-gray-600 leading-relaxed">
          <p>
            All federal positions are pulled directly from{' '}
            <a
              href="https://www.usajobs.gov/"
              className="underline hover:text-green-700"
              rel="noopener"
            >
              USAJobs.gov
            </a>{' '}
            via the official Search API, filtered to OPM job category codes
            0601–0690 (medical, hospital, dental, public health, and health
            system administration series). Apply links route directly to the
            USAJobs hosted application — freejobpost.co does not collect or
            process federal applications. Listings refresh every four hours.
          </p>
        </section>
      </main>
    </>
  )
}
