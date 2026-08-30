// /city — index page listing every curated city hub. Internal linking
// density + a single page that ranks for "healthcare jobs by city".

import Link from 'next/link'
import type { Metadata } from 'next'
import { CITY_HUBS } from '@/lib/city-slugs'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'Nursing and allied health jobs by city',
  description:
    'Browse nursing and allied health roles posted directly by employers in major US cities.',
  alternates: { canonical: 'https://freejobpost.co/city' },
  openGraph: {
    title: 'Nursing and allied health jobs by city | freejobpost.co',
    description: 'Browse direct employer posts in major US cities.',
    url: 'https://freejobpost.co/city',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nursing and allied health jobs by city | freejobpost.co',
    description: 'Browse direct employer posts in major US cities.',
    images: ['/opengraph-image'],
  },
}

export default function CityIndexPage() {
  // Group hubs by state for a scannable layout.
  const byState = new Map<string, typeof CITY_HUBS>()
  for (const hub of CITY_HUBS) {
    const list = byState.get(hub.state) ?? []
    list.push(hub)
    byState.set(hub.state, list)
  }
  const states = Array.from(byState.keys()).sort()

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://freejobpost.co/city' },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <main className="min-h-screen bg-white text-black">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#17324D]">Home</Link>
            {' / '}
            <span className="text-[#17324D] font-medium">Cities</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-[#17324D]">
            Nursing and allied health jobs by city
          </h1>
          <p className="text-lg text-gray-700 mb-10 max-w-3xl leading-relaxed">
            Browse direct employer posts in {CITY_HUBS.length} major US healthcare
            markets. Pick a city, or browse by{' '}
            <Link href="/state" className="underline hover:text-[#17324D]">state</Link>
            {' '}or{' '}
            <Link href="/specialty" className="underline hover:text-[#17324D]">specialty</Link>.
          </p>

          <div className="space-y-10">
            {states.map((state) => {
              const hubs = byState.get(state)!
              return (
                <section key={state}>
                  <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-3 border-b border-gray-200 pb-2">
                    {state}
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {hubs.map((hub) => (
                      <li key={hub.slug}>
                        <Link
                          href={`/city/${hub.slug}`}
                          className="inline-block rounded-md border border-gray-200 shadow-sm px-3 py-1.5 text-sm font-bold hover:bg-[#17324D] hover:text-white transition-colors"
                        >
                          {hub.name.split(',')[0]} →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      </main>
    </>
  )
}
