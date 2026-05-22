// /become/[slug] — per-role career-path guide.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CAREER_PATHS, getCareerPath } from '@/lib/career-paths'
import { CITY_HUBS } from '@/lib/city-slugs'
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
    },
  }
}

export default async function CareerPathPage({ params }: Props) {
  const { slug } = await params
  const guide = getCareerPath(slug)
  if (!guide) notFound()

  // Surface 4 high-volume city links for the same specialty — gives the
  // reader a "jump to current openings in <metro>" shortcut at the end of
  // the guide. Lean on the same metros we already feature on /city.
  const featuredCities = [
    'tampa-fl', 'houston-tx', 'new-york-ny', 'los-angeles-ca',
  ]
    .map((s) => CITY_HUBS.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

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
              {featuredCities.map((city) => (
                <li key={city.slug}>
                  <Link
                    href={`/city/${city.slug}/${guide.specialtySlug}`}
                    className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
                  >
                    {city.name.split(',')[0]} →
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
