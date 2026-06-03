import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CHANGELOG_ENTRIES,
  entryAnchor,
  type ChangelogTag,
  type ChangelogEntry,
} from '@/lib/changelog-entries'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'What\'s new on freejobpost.co — recent shipped features, fixes, and reliability work. Updated when something user-visible changes.',
  alternates: {
    canonical: 'https://freejobpost.co/changelog',
    types: {
      'application/rss+xml': [
        { url: 'https://freejobpost.co/changelog/feed.xml', title: 'freejobpost.co — Changelog (RSS)' },
      ],
    },
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Changelog — freejobpost.co',
    description: 'Recent ships on freejobpost.co — features, fixes, and reliability work.',
    url: 'https://freejobpost.co/changelog',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Changelog — freejobpost.co',
    description: 'Recent ships on freejobpost.co — features, fixes, and reliability work.',
    images: ['/opengraph-image'],
  },
}

type Tag = ChangelogTag
type Entry = ChangelogEntry

// Entries are the source-of-truth in src/lib/changelog-entries.ts so both
// this page and /changelog/feed.xml read the same array. Update there.
const ENTRIES = CHANGELOG_ENTRIES

const TAG_STYLES: Record<Tag, string> = {
  new: 'bg-green-700 text-white',
  improved: 'bg-black text-white',
  fixed: 'bg-amber-500 text-black',
  reliability: 'bg-blue-700 text-white',
  security: 'bg-red-700 text-white',
}

function groupByMonth(entries: Entry[]): { month: string; entries: Entry[] }[] {
  const groups = new Map<string, Entry[]>()
  for (const e of entries) {
    const d = new Date(e.date + 'T00:00:00Z')
    const key = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  return Array.from(groups, ([month, entries]) => ({ month, entries }))
}

export default function ChangelogPage() {
  const grouped = groupByMonth(ENTRIES)
  const lastUpdated = ENTRIES[0]?.date

  // BreadcrumbList — every public page emits one so Google can render
  // the breadcrumb above the title in SERP. The /changelog page was
  // missing this; sister pages (/how-it-works, /pricing, etc.) already
  // emit it.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Changelog', item: 'https://freejobpost.co/changelog' },
    ],
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-black text-lg sm:text-xl tracking-tight">
            freejobpost<span className="text-green-700">.co</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link href="/jobs" className="hidden sm:inline hover:text-green-700">Browse jobs</Link>
            <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold">Post a job</Link>
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
          <span className="w-2 h-2 bg-green-600" />
          CHANGELOG
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-6">
          What&apos;s new on<br />
          <span className="text-green-700">freejobpost.co</span>
        </h1>
        <p className="text-lg text-gray-700 leading-relaxed mb-2">
          Recent shipped features, fixes, and reliability work. We update this when something
          user-visible changes — not on every commit.
        </p>
        {lastUpdated && (
          <p className="text-sm text-gray-500 mb-12">
            Last updated <time dateTime={lastUpdated}>{lastUpdated}</time>
          </p>
        )}

        <div className="space-y-12">
          {grouped.map((group) => (
            <section key={group.month}>
              <h2 className="text-xs font-black tracking-[0.2em] text-gray-500 uppercase mb-5 pb-2 border-b border-gray-200">
                {group.month}
              </h2>
              <ul className="space-y-7">
                {group.entries.map((e) => {
                  const anchor = entryAnchor(e)
                  return (
                    <li
                      key={e.date + e.title}
                      id={anchor}
                      className="flex flex-col md:flex-row md:gap-6 scroll-mt-20 group"
                    >
                      <div className="md:w-24 shrink-0 mb-2 md:mb-0">
                        <time
                          dateTime={e.date}
                          className="text-xs font-bold text-gray-500 tabular-nums tracking-wider"
                        >
                          {e.date}
                        </time>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-1.5 flex-wrap">
                          <h3 className="text-lg font-black leading-tight tracking-tight">
                            <a
                              href={`#${anchor}`}
                              className="hover:text-green-700 focus:text-green-700"
                              aria-label={`Permalink to ${e.title}`}
                            >
                              {e.title}
                            </a>
                          </h3>
                          <span
                            className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 ${TAG_STYLES[e.tag]}`}
                          >
                            {e.tag}
                          </span>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{e.body}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t-2 border-black">
          <p className="text-sm text-gray-700">
            Want to suggest a feature or report a bug? Email{' '}
            <a href="mailto:info@avahealth.co" className="underline hover:text-green-700 font-bold">
              info@avahealth.co
            </a>
            .
          </p>
        </div>
      </article>
    </main>
  )
}
