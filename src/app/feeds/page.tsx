import type { Metadata } from 'next'
import Link from 'next/link'
import { SYNDICATION_TARGETS } from '@/lib/syndication-targets'

export const metadata: Metadata = {
  title: 'Job feeds for distribution partners',
  description:
    'XML / JSON / RSS feeds for Indeed, ZipRecruiter, Glassdoor, LinkedIn, Adzuna, Jooble, Talent.com, Google for Jobs, and other aggregators that pull from freejobpost.co.',
  alternates: { canonical: 'https://freejobpost.co/feeds' },
  // Internal/partner-facing — not a candidate landing page.
  robots: { index: false, follow: false },
}

// Submission instructions per network — paired with the SYNDICATION_TARGETS
// registry. Keep these in sync when adding a new network: the registry is
// the engineering source of truth, this map is the operational playbook.
const SUBMIT_TO: Record<string, string> = {
  indeed: 'employers.indeed.com → Free Posting → Add XML feed (https://employers.indeed.com/p/resources/free-posting)',
  ziprecruiter: 'ZipRecruiter Partner Program intake → email partners@ziprecruiter.com with the feed URL',
  glassdoor: 'Glassdoor Partner Onboarding (Indeed-owned; gated — ask your account rep)',
  linkedin: 'Your LinkedIn Recruiter / Talent Insights rep — Job Wrapping is gated and requires LinkedIn to whitelist the feed URL',
  google: 'No submission needed — Google crawls each /jobs/[slug] page directly and reads the JobPosting JSON-LD we emit. Submit /sitemap.xml to Google Search Console for crawl discovery.',
  adzuna: 'https://www.adzuna.com/partners.html → "Submit your jobs feed" form',
  jooble: 'Email partners@jooble.com with the feed URL — Jooble lists most submissions within 24-48h',
  talent: 'https://www.talent.com/syndicate → email partner@talent.com with the feed URL',
  rss: 'No submission needed — Apple News, Feedly, Inoreader, Reddit RSS bots, and most niche aggregators auto-discover via the <link rel="alternate"> tag and direct URL',
}

export default function FeedsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </span>
            <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">PARTNER</span>
          </Link>
          <Link href="/jobs" className="text-sm font-medium hover:text-green-700">
            Browse jobs →
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-xs font-bold tracking-widest text-green-700 uppercase mb-3">For distribution partners</p>
        <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-4">Job feeds.</h1>
        <p className="text-gray-700 mb-3 max-w-2xl">
          Public XML / RSS feeds you can pull to syndicate our healthcare jobs. All feeds are
          open, no auth required, refreshed every 15 minutes.
        </p>
        <p className="text-gray-700 mb-10 max-w-2xl">
          Each posted job has per-network opt-in checkboxes — you only see jobs the recruiter
          chose to share with your network. If you need a different format or fields, contact{' '}
          <a href="mailto:hello@avahealth.co" className="underline">hello@avahealth.co</a>.
        </p>

        <div className="space-y-5">
          {SYNDICATION_TARGETS.map((t) => (
            <div key={t.id} className="border-2 border-black p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 className="text-xl font-black">{t.label}</h2>
                <span className="text-[10px] font-mono bg-black text-white px-2 py-1 tracking-wider">{t.spec}</span>
              </div>
              <p className="text-sm text-gray-700 mb-2">{t.blurb} <span className="text-gray-500">· {t.reach}</span></p>
              <a href={t.feedUrl} className="text-sm font-mono text-green-700 underline break-all">{t.feedUrl}</a>
              <p className="text-sm text-gray-700 mt-3">
                <span className="font-bold">Submit to:</span> {SUBMIT_TO[t.id] ?? 'Contact partner team for onboarding instructions.'}
              </p>
            </div>
          ))}

          {/* Sitemap is special — not a per-job-feed but the crawl-discovery signal */}
          <div className="border-2 border-black p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-xl font-black">Sitemap (crawl discovery)</h2>
              <span className="text-[10px] font-mono bg-black text-white px-2 py-1 tracking-wider">sitemaps.org 0.9</span>
            </div>
            <p className="text-sm text-gray-700 mb-2">For Google, Bing, DuckDuckGo, and any general-purpose web crawler.</p>
            <a href="https://freejobpost.co/sitemap.xml" className="text-sm font-mono text-green-700 underline break-all">https://freejobpost.co/sitemap.xml</a>
            <p className="text-sm text-gray-700 mt-3">
              <span className="font-bold">Submit to:</span> Google Search Console → Sitemaps → Add /sitemap.xml. Bing Webmaster Tools accepts the same URL.
            </p>
          </div>
        </div>

        <div className="mt-12 p-5 border-2 border-dashed border-gray-400">
          <h2 className="font-bold text-lg mb-2">Feed compliance</h2>
          <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
            <li>All listings link back to <code>freejobpost.co/jobs/[slug]</code> with full job description and apply form.</li>
            <li>Salary fields are present where the employer chose to disclose them.</li>
            <li>Expired/removed jobs are dropped from the feed within 15 minutes (next ISR cycle).</li>
            <li>Each feed only lists jobs whose recruiter opted into that specific network — empty feed is normal if no recruiter has opted in to your network yet.</li>
            <li>No duplicates across feeds — each job appears once per network with a stable <code>slug</code> reference.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
