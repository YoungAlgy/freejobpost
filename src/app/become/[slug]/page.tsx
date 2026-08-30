// /become/[slug] — per-role career-path guide.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CAREER_PATHS, getCareerPath } from '@/lib/career-paths'
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
    image: 'https://freejobpost.co/opengraph-image',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://freejobpost.co/become/${guide.slug}`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'FreeJobPost',
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
        <article className="max-w-3xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#17324D]">Home</Link>
            {' / '}
            <Link href="/become" className="hover:text-[#17324D]">Career paths</Link>
            {' / '}
            <span className="text-[#17324D] font-medium">{guide.abbreviation || guide.title}</span>
          </nav>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-4 leading-tight text-[#17324D]">
            {guide.title}
          </h1>
          <p className="text-lg text-gray-700 mb-8 leading-relaxed">{guide.lede}</p>

          {/* Mid-page CTA — primary value-add over competing how-to sites */}
          <aside className="rounded-xl border border-gray-200 shadow-sm bg-[#276749]/10 p-4 mb-10">
            <p className="text-xs font-bold tracking-widest text-gray-700 uppercase mb-1">
              Looking for current openings?
            </p>
            <p className="text-sm text-gray-800 mb-3">
              Browse {guide.specialtyLabel.toLowerCase()} posted directly by employers.
            </p>
            <Link
              href={`/specialty/${guide.specialtySlug}`}
              className="inline-flex items-center font-bold border-b-2 border-[#17324D] text-[#17324D] hover:border-[#17324D] pb-0.5"
            >
              See current {guide.specialtyLabel.toLowerCase()} →
            </Link>
          </aside>

          <div className="prose prose-lg max-w-none space-y-8">
            {guide.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-black tracking-tight mb-3 text-[#17324D]">{section.heading}</h2>
                <p className="text-gray-800 leading-relaxed">{section.body}</p>
              </section>
            ))}
          </div>

          <section className="mt-10 border-t border-gray-200 pt-8">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
              Other healthcare career guides
            </h2>
            <ul className="flex flex-wrap gap-2">
              {CAREER_PATHS.filter((p) => p.slug !== guide.slug).map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/become/${other.slug}`}
                    className="inline-block rounded-md border border-gray-200 shadow-sm px-3 py-2 text-sm font-bold hover:bg-[#17324D] hover:text-white transition-colors"
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
