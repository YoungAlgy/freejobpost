// /become/[slug] — per-role career-path guide.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CAREER_PATHS, getCareerPath } from '@/lib/career-paths'
import { CITY_HUBS } from '@/lib/city-slugs'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'
import { supabase } from '@/lib/supabase'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const revalidate = 86400 // content is static — recheck daily

export async function generateStaticParams() {
  return CAREER_PATHS.map((p) => ({ slug: p.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = getCareerPath(slug)
  if (!guide) return {}
  const canonical = `https://freejobpost.co/become/${guide.slug}`
  return {
    title: guide.title,
    description: guide.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: `${guide.title} | freejobpost.co`,
      description: guide.metaDescription,
      url: canonical,
      type: 'article',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${guide.title} | freejobpost.co`,
      description: guide.metaDescription,
      images: ['/opengraph-image'],
    },
  }
}

export default async function CareerPathPage({ params }: Props) {
  const { slug } = await params
  const guide = getCareerPath(slug)
  if (!guide) notFound()

  // Surface up to 4 city links for the same specialty — gives the reader a
  // "jump to current openings in <metro>" shortcut at the end of the
  // guide. Filter against the city×specialty viable-cells set so we only
  // link to /city/<slug>/<specialty> URLs that actually render (≥5 jobs).
  // Falls back to the parent /city/<slug> link when the cell doesn't
  // exist for this specialty in the target metro.
  //
  // 8s timeout: getViableCityCellsCached fires a 12-batch fetch and was
  // the root cause of /become/[slug] builds timing out at the 60s Vercel
  // cap when public_jobs grew past ~50K rows. On timeout we render the
  // city links without the cellExists badge — the page still ships,
  // and the next ISR revalidate will retry the lookup with fresh cache.
  const cityCellsPromise = getViableCityCellsCached(supabase).catch(() => [] as Awaited<ReturnType<typeof getViableCityCellsCached>>)
  const timeoutPromise = new Promise<Awaited<ReturnType<typeof getViableCityCellsCached>>>((resolve) =>
    setTimeout(() => resolve([]), 8000),
  )
  const cityCells = await Promise.race([cityCellsPromise, timeoutPromise])
  const featuredCityCandidates = [
    'houston-tx', 'new-york-ny', 'los-angeles-ca', 'tampa-fl',
    'chicago-il', 'boston-ma', 'atlanta-ga', 'dallas-tx',
  ]
  const featuredCities = featuredCityCandidates
    .map((slug) => {
      const hub = CITY_HUBS.find((c) => c.slug === slug)
      if (!hub) return null
      const cellExists = cityCells.some(
        (c) => c.city.slug === slug && c.specialty.slug === guide.specialtySlug,
      )
      return hub ? { hub, cellExists } : null
    })
    .filter((c): c is { hub: NonNullable<typeof CITY_HUBS[number]>; cellExists: boolean } => c !== null)
    .slice(0, 4)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Career paths', item: 'https://freejobpost.co/become' },
      { '@type': 'ListItem', position: 3, name: guide.title, item: `https://freejobpost.co/become/${guide.slug}` },
    ],
  }

  // Article schema for the guide content. Google's HowTo schema retired
  // March 2025 so we use Article instead — same factual content, less
  // schema-rejection risk. The freejobpost.co Organization graph in the
  // root layout supplies the publisher info.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.metaDescription,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://freejobpost.co/become/${guide.slug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Free Job Post',
      url: 'https://freejobpost.co',
    },
    inLanguage: 'en-US',
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
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

        <article className="max-w-3xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-black">Home</Link>
            {' / '}
            <Link href="/become" className="hover:text-black">Career paths</Link>
            {' / '}
            <span className="text-black font-medium">{guide.abbreviation || guide.title}</span>
          </nav>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4 leading-tight">
            {guide.title}
          </h1>
          <p className="text-lg text-gray-700 mb-8 leading-relaxed">{guide.lede}</p>

          {/* Mid-page CTA — primary value-add over competing how-to sites */}
          <aside className="border-2 border-black bg-green-50 p-4 mb-10">
            <p className="text-xs font-bold tracking-widest text-gray-700 uppercase mb-1">
              Looking for current openings?
            </p>
            <p className="text-sm text-gray-800 mb-3">
              We aggregate {guide.specialtyLabel.toLowerCase()} from hospital ATS
              feeds + direct employer postings. Updated continuously.
            </p>
            <Link
              href={`/specialty/${guide.specialtySlug}`}
              className="inline-flex items-center font-bold border-b-2 border-black hover:text-green-700 hover:border-green-700 pb-0.5"
            >
              See current {guide.specialtyLabel.toLowerCase()} →
            </Link>
          </aside>

          <div className="prose prose-lg max-w-none space-y-8">
            {guide.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-black tracking-tight mb-3">{section.heading}</h2>
                <p className="text-gray-800 leading-relaxed">{section.body}</p>
              </section>
            ))}
          </div>

          <section className="mt-12 border-t-2 border-black pt-8">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Current {guide.specialtyLabel.toLowerCase()} by metro
            </h2>
            <ul className="flex flex-wrap gap-2">
              {featuredCities.map(({ hub, cellExists }) => (
                <li key={hub.slug}>
                  <Link
                    // When the city×specialty cell exists, link deep so
                    // readers land on the filtered list. When it doesn't
                    // (cell has <5 active matching jobs for this
                    // specialty), fall back to the city hub — never link
                    // to a known-404 URL.
                    href={cellExists ? `/city/${hub.slug}/${guide.specialtySlug}` : `/city/${hub.slug}`}
                    className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                  >
                    {hub.name.split(',')[0]} →
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`/specialty/${guide.specialtySlug}`}
                  className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                >
                  All US openings →
                </Link>
              </li>
            </ul>
          </section>

          <section className="mt-10 border-t-2 border-black pt-8">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Other healthcare career guides
            </h2>
            <ul className="flex flex-wrap gap-2">
              {CAREER_PATHS.filter((p) => p.slug !== guide.slug).map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/become/${other.slug}`}
                    className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                  >
                    {other.abbreviation || other.specialtyLabel.replace(/ jobs$/i, '')} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
    </>
  )
}
