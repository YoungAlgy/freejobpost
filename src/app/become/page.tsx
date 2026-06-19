// /become — index page for the career-path guides. The /become/[slug]
// pages target the upstream "how to become a <role>" query family;
// this index gives the cluster a single discoverable hub.

import Link from 'next/link'
import type { Metadata } from 'next'
import { CAREER_PATHS } from '@/lib/career-paths'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'Healthcare career-path guides',
  description:
    'How to become an RN, NP, PA, CRNA, or PharmD: education, licensing, timeline, and current openings. Free guides, no email gate.',
  alternates: { canonical: 'https://freejobpost.co/become' },
  openGraph: {
    title: 'Healthcare career-path guides | freejobpost.co',
    description:
      'Education + licensing + timeline guides for healthcare roles. Plain-English, no email gate.',
    url: 'https://freejobpost.co/become',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthcare career-path guides | freejobpost.co',
    description:
      'Education + licensing + timeline guides for healthcare roles. Plain-English, no email gate.',
    images: ['/opengraph-image'],
  },
}

export default function CareerPathsIndex() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Career paths', item: 'https://freejobpost.co/become' },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <main className="min-h-screen bg-white text-black">
        <nav className="border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-black text-lg sm:text-xl tracking-tight text-[#003D5C]">
              Ava Health
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-[#003D5C]">All jobs</Link>
              <Link href="/post-job" className="bg-[#7FBC00] text-white px-4 py-2 font-bold rounded-md hover:bg-[#6DA300]">Post a Job</Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#003D5C]">Home</Link>
            {' / '}
            <span className="text-[#003D5C] font-medium">Career paths</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-[#003D5C]">
            Healthcare career-path guides
          </h1>
          <p className="text-lg text-gray-700 mb-10 leading-relaxed max-w-3xl">
            Plain-English summaries of how to enter each healthcare role:
            education, licensing, exams, timeline, and links to current job
            openings. No email gate, no upsell to a partner school. If you
            want to skip the guide and look at jobs directly, browse the
            <Link href="/specialty" className="underline hover:text-[#003D5C]"> specialty list</Link>.
          </p>

          <ul className="space-y-6">
            {CAREER_PATHS.map((path) => (
              <li key={path.slug} className="rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-2xl font-black mb-2 text-[#003D5C]">
                  <Link href={`/become/${path.slug}`} className="hover:text-[#003D5C]">
                    {path.title}
                  </Link>
                </h2>
                <p className="text-sm text-gray-700 mb-3">{path.oneLiner}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Link
                    href={`/become/${path.slug}`}
                    className="font-bold border-b-2 border-[#003D5C] text-[#003D5C] hover:border-[#002A40] pb-0.5"
                  >
                    Read the guide →
                  </Link>
                  <Link
                    href={`/specialty/${path.specialtySlug}`}
                    className="text-gray-700 hover:text-[#003D5C] hover:underline pb-0.5"
                  >
                    Open {path.specialtyLabel.toLowerCase()} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  )
}
