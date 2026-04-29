// /state — index page listing every state hub. Internal linking density
// + a single page that ranks for "healthcare jobs by state".

import Link from 'next/link'
import type { Metadata } from 'next'
import { STATE_HUBS } from '@/lib/state-slugs'

export const metadata: Metadata = {
  title: 'Healthcare jobs by state',
  description: 'Healthcare jobs organized by state — Florida, Texas, California, New York, Illinois, Pennsylvania, Ohio, Georgia, North Carolina, Massachusetts, Michigan. Free to browse, free to apply.',
  alternates: { canonical: 'https://freejobpost.co/state' },
  openGraph: {
    title: 'Healthcare jobs by state | freejobpost.co',
    description: 'Browse open healthcare roles by state.',
    url: 'https://freejobpost.co/state',
    type: 'website',
  },
}

export default function StateIndexPage() {
  return (
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
          <span className="text-black font-medium">States</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          Healthcare jobs <span className="text-green-700">by state</span>
        </h1>
        <p className="text-lg text-gray-700 leading-relaxed mb-10 max-w-3xl">
          Pick a state to see every active opening in that market. Each hub aggregates physician, APP, nursing, and allied-health postings from verified US employers.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {STATE_HUBS.map((s) => (
            <Link
              key={s.slug}
              href={`/state/${s.slug}`}
              className="block border-2 border-black p-4 hover:bg-black hover:text-white transition-colors"
            >
              <h2 className="font-black text-lg tracking-tight mb-1">{s.name} <span className="text-xs font-medium text-gray-500 group-hover:text-white">{s.abbr}</span></h2>
              <p className="text-sm">{s.shortDescription}</p>
            </Link>
          ))}
        </div>
      </article>

      {/* Breadcrumb schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
              { '@type': 'ListItem', position: 2, name: 'States', item: 'https://freejobpost.co/state' },
            ],
          }),
        }}
      />
    </main>
  )
}
