import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Job feeds for distribution partners',
  description:
    'XML / JSON feeds for Indeed, ZipRecruiter, Glassdoor, LinkedIn, Google for Jobs, and other aggregators that pull from freejobpost.co.',
  alternates: { canonical: 'https://freejobpost.co/feeds' },
  // Internal/partner-facing — not a candidate landing page.
  robots: { index: false, follow: false },
}

const feeds = [
  {
    name: 'Indeed XML / Universal Aggregator Feed',
    url: 'https://freejobpost.co/jobs.xml',
    spec: 'Indeed v2 XML',
    targets: ['Indeed (Free Posting)', 'ZipRecruiter Open Network', 'Glassdoor', 'Most ATS aggregators'],
    submitTo:
      'employers.indeed.com → Free Posting → Add XML feed; ZipRecruiter partner intake; Glassdoor Native Feed onboarding.',
    note: 'Single Indeed-format feed satisfies 90% of aggregators including ZipRecruiter and Glassdoor — they all parse this spec.',
  },
  {
    name: 'LinkedIn Job Wrapping Feed',
    url: 'https://freejobpost.co/feeds/linkedin.xml',
    spec: 'LinkedIn Job Wrapping XML',
    targets: ['LinkedIn Limited Listings (Job Wrapping)'],
    submitTo:
      'Your LinkedIn Recruiter / Talent Insights rep — wrapping is gated and requires LinkedIn to whitelist your feed URL.',
    note: 'Different spec from Indeed (ISO 8601 dates, partnerJobId, applyUrl, SCREAMING_SNAKE_CASE jobtype).',
  },
  {
    name: 'Google for Jobs (JSON-LD)',
    url: 'https://freejobpost.co/jobs/[slug]',
    spec: 'schema.org JobPosting JSON-LD',
    targets: ['Google for Jobs (Search results)'],
    submitTo:
      'No submission needed. Google crawls each /jobs/[slug] page directly and reads the JobPosting JSON-LD we emit.',
    note: 'Sitemap at /sitemap.xml lists every active job slug for crawl discovery.',
  },
  {
    name: 'Sitemap (crawl discovery)',
    url: 'https://freejobpost.co/sitemap.xml',
    spec: 'sitemaps.org 0.9',
    targets: ['Google', 'Bing', 'DuckDuckGo', 'any web crawler'],
    submitTo: 'Google Search Console → Sitemaps → Add /sitemap.xml.',
    note: 'Auto-rebuilt as jobs are added/expired.',
  },
]

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
        <p className="text-gray-700 mb-10 max-w-2xl">
          Public XML/JSON feeds you can pull to syndicate our healthcare jobs. All feeds are
          open, no auth required, refreshed every 15 minutes. If you need a different format
          or fields, contact <a href="mailto:hello@avahealth.co" className="underline">hello@avahealth.co</a>.
        </p>

        <div className="space-y-6">
          {feeds.map((f) => (
            <div key={f.url} className="border-2 border-black p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 className="text-xl font-black">{f.name}</h2>
                <span className="text-[10px] font-mono bg-black text-white px-2 py-1 tracking-wider">{f.spec}</span>
              </div>
              <a href={f.url} className="text-sm font-mono text-green-700 underline break-all">{f.url}</a>
              <p className="text-sm text-gray-700 mt-3">
                <span className="font-bold">Targets:</span> {f.targets.join(' · ')}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-bold">Submit to:</span> {f.submitTo}
              </p>
              <p className="text-xs text-gray-500 mt-2 italic">{f.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 p-5 border-2 border-dashed border-gray-400">
          <h2 className="font-bold text-lg mb-2">Feed compliance</h2>
          <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
            <li>All listings link back to <code>freejobpost.co/jobs/[slug]</code> with full job description and apply form.</li>
            <li>Salary fields are present where the employer chose to disclose them.</li>
            <li>Expired/removed jobs are dropped from the feed within 15 minutes (next ISR cycle).</li>
            <li>No duplicates across feeds — each job appears once with a stable <code>slug</code> reference.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
