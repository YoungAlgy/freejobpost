// /specialty — index page listing every specialty hub. Internal linking
// density + a single page that ranks for "[healthcare specialty] jobs".

import Link from 'next/link'
import type { Metadata } from 'next'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'

import { safeJsonLd } from '@/lib/safe-jsonld'
export const metadata: Metadata = {
  title: 'Healthcare jobs by specialty',
  description: 'Healthcare jobs organized by specialty: cardiology, ortho, hospitalist, EM, anesth, derm, GI, peds, OBGYN, CRNA, NP, PA, RN. Free to browse + apply.',
  alternates: { canonical: 'https://freejobpost.co/specialty' },
  openGraph: {
    title: 'Healthcare jobs by specialty | freejobpost.co',
    description: 'Browse open healthcare roles by specialty.',
    url: 'https://freejobpost.co/specialty',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthcare jobs by specialty | freejobpost.co',
    description: 'Browse open healthcare roles by specialty.',
    images: ['/opengraph-image'],
  },
}

export default function SpecialtyIndexPage() {
  return (
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

      <article className="max-w-6xl mx-auto px-6 py-12">
        <nav className="text-xs text-gray-600 mb-3" aria-label="breadcrumb">
          <Link href="/" className="hover:text-[#003D5C]">Home</Link>
          {' / '}
          <span className="text-[#003D5C] font-medium">Specialties</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 text-[#003D5C]">
          Healthcare jobs by specialty
        </h1>
        <p className="text-lg text-gray-700 leading-relaxed mb-10 max-w-3xl">
          Pick a specialty to see every active opening for that role on Ava Health. Each hub aggregates physician + APP + nursing + allied-health postings in one place.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SPECIALTY_HUBS.map((s) => (
            <Link
              key={s.slug}
              href={`/specialty/${s.slug}`}
              className="block rounded-xl border border-gray-200 shadow-sm p-4 hover:bg-[#003D5C] hover:text-white transition-colors"
            >
              <h2 className="font-black text-lg tracking-tight mb-1">{s.title}</h2>
              <p className="text-sm">{s.shortDescription}</p>
            </Link>
          ))}
        </div>
      </article>

      {/* Breadcrumb schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
              { '@type': 'ListItem', position: 2, name: 'Specialties', item: 'https://freejobpost.co/specialty' },
            ],
          }),
        }}
      />
    </main>
  )
}
