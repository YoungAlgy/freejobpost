import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'What\'s new on freejobpost.co — recent shipped features, fixes, and reliability work. Updated when something user-visible changes.',
  alternates: { canonical: 'https://freejobpost.co/changelog' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Changelog — freejobpost.co',
    description: 'Recent ships on freejobpost.co — features, fixes, and reliability work.',
    url: 'https://freejobpost.co/changelog',
    type: 'website',
  },
}

type Tag = 'new' | 'improved' | 'fixed' | 'reliability' | 'security'

interface Entry {
  date: string
  title: string
  body: string
  tag: Tag
}

// Hand-curated, user-visible entries. Not every commit ships here — only the
// ones an employer or job-seeker would actually notice. Update on significant
// ships; see memory/feedback_changelog_discipline.md.
const ENTRIES: Entry[] = [
  // ── May 2026 ──────────────────────────────────────────────────────────────
  {
    date: '2026-05-13',
    title: 'Specialty × state landing pages',
    body:
      'Pages like /specialty/registered-nurse/florida now exist for every viable combination. Each renders only when there are ≥5 active matching jobs, so you never land on an empty page.',
    tag: 'new',
  },
  {
    date: '2026-05-13',
    title: 'Salary panel on state + specialty hubs',
    body:
      'Every state and specialty hub now shows a real pay range computed from the live job inventory — 10th–90th percentile bounds with the median called out. No more guessing.',
    tag: 'new',
  },
  {
    date: '2026-05-13',
    title: 'State hub editorials + license-board links',
    body:
      'All 50 state hubs now carry a short, factual market note plus the actual state nursing board name + URL and Nurse Licensure Compact status. Useful before you accept an interview.',
    tag: 'improved',
  },
  {
    date: '2026-05-13',
    title: 'Mobile nav + iOS input fix',
    body:
      'Mobile nav was hiding all secondary links on small screens. Fixed across every key surface. Also stopped iOS Safari from auto-zooming when you tap an input — forms feel native now.',
    tag: 'fixed',
  },
  {
    date: '2026-05-13',
    title: 'Sign-on bonus stripped from public titles',
    body:
      'A handful of seeded job titles were leaking sign-on bonuses into the title and search labels. Cleaned up at the data layer plus a defense-in-depth render guard.',
    tag: 'fixed',
  },
  {
    date: '2026-05-13',
    title: 'IndexNow — new jobs ping Bing + Yandex',
    body:
      'New job posts now push to Bing, Yandex, Naver, Seznam, and Yep within seconds of publishing. Indexing latency on non-Google search engines drops from days to minutes.',
    tag: 'reliability',
  },
  {
    date: '2026-05-13',
    title: 'Server-side 10-post quota enforcement',
    body:
      'The "10 free posts per employer" cap is now enforced on the server, not just the UI. Graceful-degrade: if the quota check itself fails, the post still goes through.',
    tag: 'reliability',
  },
  {
    date: '2026-05-13',
    title: 'Next.js 16.2.4 → 16.2.6 (DoS patch)',
    body:
      'Bumped Next.js to patch a Server-Components DoS vulnerability. No user action required.',
    tag: 'security',
  },
  // ── May 8 batch ───────────────────────────────────────────────────────────
  {
    date: '2026-05-08',
    title: 'Employer applicant tracking',
    body:
      'Employer dashboard now shows applicant contact info inline — name, email, phone, applied date — without a click-through. The "see who applied" experience matches Indeed without the paywall.',
    tag: 'new',
  },
  {
    date: '2026-05-08',
    title: '/for-employers + /employers directory',
    body:
      'New employer acquisition page (/for-employers) explains the model without jargon. New /employers directory gives each verified hiring company its own SEO landing page.',
    tag: 'new',
  },
  {
    date: '2026-05-08',
    title: 'URL-state filter sync on /jobs',
    body:
      'Search filters now live in the URL. Deep-link a filtered view, share it, hit back — the filter state always matches what you see on screen.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Job list pagination',
    body:
      'Paginated at 50 jobs per page so the DOM never balloons past a thousand nodes. Pages load faster on slow connections.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Custom 404 page',
    body:
      'A real 404 page with helpful links back into the site instead of the framework default.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Open redirect + session-cookie hardening',
    body:
      'Closed an open-redirect vector in the employer auth flow and tightened session cookie flags. Bonus: Turnstile widget now resets cleanly after a failed submit.',
    tag: 'security',
  },
  // ── Launch ────────────────────────────────────────────────────────────────
  {
    date: '2026-04-27',
    title: 'Initial launch',
    body:
      'freejobpost.co goes live — free healthcare job posts, no auction, no paywall, no recruiter spam. Includes JobPosting JSON-LD for Google for Jobs visibility from day one.',
    tag: 'new',
  },
]

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

  return (
    <main className="min-h-screen bg-white text-black">
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-black text-xl tracking-tight">
            freejobpost<span className="text-green-700">.co</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link href="/jobs" className="hover:text-green-700">Browse jobs</Link>
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
                  const anchor = `${e.date}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
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
            <a href="mailto:alex@avahealth.co" className="underline hover:text-green-700 font-bold">
              alex@avahealth.co
            </a>
            .
          </p>
        </div>
      </article>
    </main>
  )
}
