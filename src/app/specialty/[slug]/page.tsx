// /specialty/[slug] — SEO hub page listing jobs filtered by specialty.
// One page per common specialty (cardiology, ortho, hospitalist, RN,
// CRNA, etc.) so each ranks individually for "[specialty] jobs" queries.

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
import { SPECIALTY_HUBS, getSpecialtyHub } from '@/lib/specialty-slugs'

export const revalidate = 600

export async function generateStaticParams() {
  return SPECIALTY_HUBS.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const hub = getSpecialtyHub(slug)
  if (!hub) return {}
  return {
    title: hub.title,
    description: hub.metaDescription,
    alternates: { canonical: `https://freejobpost.co/specialty/${hub.slug}` },
    openGraph: {
      title: `${hub.title} | freejobpost.co`,
      description: hub.metaDescription,
      url: `https://freejobpost.co/specialty/${hub.slug}`,
      type: 'website',
    },
  }
}

async function fetchJobsForHub(matchPatterns: string[]): Promise<PublicJob[]> {
  // PostgREST `or=` for matching specialty/title/role across all patterns.
  const orParts: string[] = []
  for (const p of matchPatterns) {
    const enc = encodeURIComponent(`*${p}*`)
    orParts.push(`specialty.ilike.${enc}`, `title.ilike.${enc}`, `role.ilike.${enc}`)
  }
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(orParts.join(','))
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

  // States represented in the result set — used for the "by state" linkbar
  const states = Array.from(
    new Set(jobs.map((j) => j.state?.trim()).filter((s): s is string => !!s))
  ).sort()

  // Top-10 jobs JSON-LD for Google for Jobs discovery
  const topJobsJsonLd = jobs.slice(0, 10).map((job) => ({
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description?.slice(0, 500),
    datePosted: job.created_at?.split('T')[0],
    validThrough: job.expires_at,
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Ava Health Partners',
      sameAs: 'https://avahealth.co',
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

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
      { '@type': 'ListItem', position: 3, name: hub.title, item: `https://freejobpost.co/specialty/${hub.slug}` },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {topJobsJsonLd.map((j, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(j) }}
        />
      ))}

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
            <Link href="/jobs" className="hover:text-green-700">Jobs</Link>
            {' / '}
            <span className="text-black font-medium">{hub.title}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {hub.title} <span className="text-green-700">— {jobs.length}</span>
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed mb-10 max-w-3xl">
            {hub.shortDescription} Every posting here is from a verified US healthcare employer — no third-party staffing reposts, no recruiter spam. Free to browse, free to apply.
          </p>

          {/* By-state linkbar for internal linking density */}
          {states.length > 0 && (
            <div className="mb-10 flex flex-wrap gap-2">
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

          {jobs.length === 0 ? (
            <div className="border-2 border-black p-8 text-center">
              <p className="text-lg font-bold mb-2">No active {hub.title.toLowerCase()} right now.</p>
              <p className="text-gray-700 mb-4">Check back tomorrow — we typically see new postings every business day.</p>
              <Link href="/jobs" className="inline-block bg-green-700 text-white font-bold px-6 py-2 hover:bg-green-600">Browse all jobs →</Link>
            </div>
          ) : (
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
          )}

          {/* Other specialties — internal linking */}
          <h2 className="text-2xl font-black tracking-tight mt-16 mb-4">Browse other specialties</h2>
          <div className="flex flex-wrap gap-2">
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
        </article>
      </main>
    </>
  )
}
