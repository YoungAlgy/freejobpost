// /city/[slug]/[specialty] — long-tail matrix surface. Combines a curated
// metro (city-slugs.ts) with a healthcare specialty (specialty-slugs.ts)
// for queries like "registered nurse jobs Tampa", "cardiology Houston",
// "nurse practitioner Boston". Only renders when the (city, specialty)
// cell has ≥5 active matching jobs — same thin-content threshold as the
// state×specialty matrix.

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
import { getCityHub } from '@/lib/city-slugs'
import { getSpecialtyHub } from '@/lib/specialty-slugs'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'
import { findStateHubByAbbr } from '@/lib/state-slugs'
import { stripSalarySuffix } from '@/lib/clean-labels'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const revalidate = 600
// Cells we haven't pre-rendered (i.e. specialty patterns added after
// build, or cells that grew from <5 → ≥5 jobs between builds) should
// 404 rather than rendering an empty page.
export const dynamicParams = false

type Props = { params: Promise<{ slug: string; specialty: string }> }

export async function generateStaticParams() {
  const cells = await getViableCityCellsCached(supabase)
  return cells.map((c) => ({ slug: c.city.slug, specialty: c.specialty.slug }))
}

// Build PostgREST .or() filter for the city's match patterns.
function cityOrFilter(patterns: string[]): string {
  return patterns.map((p) => `city.ilike.%${p}%`).join(',')
}

// Build PostgREST .or() filter for the specialty's match patterns,
// scanning specialty/role/title fields.
function specialtyOrFilter(patterns: string[]): string {
  const parts: string[] = []
  for (const p of patterns) {
    parts.push(`specialty.ilike.%${p}%`)
    parts.push(`role.ilike.%${p}%`)
    parts.push(`title.ilike.%${p}%`)
  }
  return parts.join(',')
}

async function fetchCellJobs(
  cityPatterns: string[],
  state: string,
  specialtyPatterns: string[],
): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .eq('state', state)
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(cityOrFilter(cityPatterns))
    .or(specialtyOrFilter(specialtyPatterns))
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as PublicJob[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, specialty } = await params
  const cityHub = getCityHub(slug)
  const specialtyHub = getSpecialtyHub(specialty)
  if (!cityHub || !specialtyHub) return {}
  const cleanSpecialty = specialtyHub.title.replace(/ Jobs$/, '')
  const cityShort = cityHub.name.split(',')[0]
  const title = `${cleanSpecialty} jobs in ${cityHub.name}`
  const description = `Free ${cleanSpecialty.toLowerCase()} jobs in ${cityShort} — apply directly, no recruiter spam. ${specialtyHub.shortDescription}`.slice(0, 155)
  const canonical = `https://freejobpost.co/city/${cityHub.slug}/${specialtyHub.slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | freejobpost.co`,
      description,
      url: canonical,
      type: 'website',
    },
  }
}

export default async function CitySpecialtyMatrixPage({ params }: Props) {
  const { slug, specialty } = await params
  const cityHub = getCityHub(slug)
  const specialtyHub = getSpecialtyHub(specialty)
  if (!cityHub || !specialtyHub) notFound()

  const jobs = await fetchCellJobs(
    cityHub.cityMatchPatterns,
    cityHub.state,
    specialtyHub.matchPatterns,
  )
  // Defense-in-depth: if generateStaticParams included this cell but the
  // runtime fetch returns fewer than MIN_JOBS_PER_CELL (timing drift
  // between build + render), 404 rather than ship a thin page.
  if (jobs.length < 5) notFound()

  const cleanSpecialty = specialtyHub.title.replace(/ Jobs$/, '')
  const cityShort = cityHub.name.split(',')[0]
  const stateHub = findStateHubByAbbr(cityHub.state)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://freejobpost.co/city' },
      { '@type': 'ListItem', position: 3, name: cityHub.name, item: `https://freejobpost.co/city/${cityHub.slug}` },
      { '@type': 'ListItem', position: 4, name: specialtyHub.title, item: `https://freejobpost.co/city/${cityHub.slug}/${specialtyHub.slug}` },
    ],
  }

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cleanSpecialty} jobs in ${cityHub.name}`,
    numberOfItems: Math.min(jobs.length, 30),
    itemListElement: jobs.slice(0, 30).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://freejobpost.co/jobs/${j.slug}`,
      name: j.title,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemListJsonLd) }}
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

        <div className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-black">Home</Link>
            {' / '}
            <Link href="/city" className="hover:text-black">Cities</Link>
            {' / '}
            <Link href={`/city/${cityHub.slug}`} className="hover:text-black">{cityHub.name}</Link>
            {' / '}
            <span className="text-black font-medium">{cleanSpecialty}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
            {cleanSpecialty} jobs in {cityShort}
          </h1>
          <p className="text-base text-gray-600 mb-6">
            <span className="tabular-nums font-bold text-black">{jobs.length}</span>
            {' '}
            {jobs.length === 1 ? 'open role' : 'open roles'}
          </p>

          <p className="text-lg text-gray-700 mb-8 max-w-3xl leading-relaxed">
            {specialtyHub.shortDescription} {cityHub.shortDescription.split('—')[1]?.trim() ? `In ${cityHub.name}: ${cityHub.shortDescription.split('—')[1]?.trim()}` : ''}
          </p>

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
                          <div className="text-sm font-bold tabular-nums shrink-0">{sal}</div>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="mt-12 border-t-2 border-black pt-8">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Browse more
            </h2>
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={`/city/${cityHub.slug}`}
                  className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                >
                  All {cityShort} jobs →
                </Link>
              </li>
              <li>
                <Link
                  href={`/specialty/${specialtyHub.slug}`}
                  className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                >
                  {cleanSpecialty} nationwide →
                </Link>
              </li>
              {stateHub && (
                <li>
                  <Link
                    href={`/specialty/${specialtyHub.slug}/${stateHub.slug}`}
                    className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                  >
                    {cleanSpecialty} in {stateHub.name} →
                  </Link>
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </>
  )
}
