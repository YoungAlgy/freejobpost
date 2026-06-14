// /city — index page listing every curated city hub. Internal linking
// density + a single page that ranks for "healthcare jobs by city".

import Link from 'next/link'
import type { Metadata } from 'next'
import { CITY_HUBS } from '@/lib/city-slugs'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'Healthcare jobs by city',
  description:
    'Healthcare jobs in the top US metros — Houston, NYC, LA, Boston, Tampa, Atlanta, Dallas, Chicago, and more. Free to browse + apply.',
  alternates: { canonical: 'https://freejobpost.co/city' },
  openGraph: {
    title: 'Healthcare jobs by city | freejobpost.co',
    description: 'Browse open healthcare roles in the top US metros.',
    url: 'https://freejobpost.co/city',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Healthcare jobs by city | freejobpost.co',
    description: 'Browse open healthcare roles in the top US metros.',
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
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-black text-lg sm:text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-green-700">All jobs</Link>
              <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold">Post a job</Link>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-6 py-12">
          <nav className="text-xs text-gray-500 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-black">Home</Link>
            {' / '}
            <span className="text-black font-medium">Cities</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            Healthcare jobs by city
          </h1>
          <p className="text-lg text-gray-700 mb-10 max-w-3xl leading-relaxed">
            {CITY_HUBS.length} top US healthcare metros, each with major-employer
            breakouts + direct links to open roles. Browse the city you're
            interested in — or browse by{' '}
            <Link href="/state" className="underline hover:text-green-700">state</Link>
            {' '}or{' '}
            <Link href="/specialty" className="underline hover:text-green-700">specialty</Link>.
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
                          className="inline-block border-2 border-black px-3 py-1.5 text-sm font-bold hover:bg-black hover:text-white transition-colors"
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
