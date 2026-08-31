import type { Metadata } from 'next'
import { FREEJOBPOST_SUPPORT_EMAIL } from '@/lib/freejobpost-email'
import { SYNDICATION_TARGETS } from '@/lib/syndication-targets'

export const metadata: Metadata = {
  title: 'Job feeds for distribution partners',
  description:
    'XML / JSON / RSS feeds for Indeed, ZipRecruiter, Glassdoor, LinkedIn, Adzuna, Jooble, Talent.com, Google for Jobs, and other aggregators that pull from freejobpost.co.',
  alternates: { canonical: 'https://freejobpost.co/feeds' },
  // Internal/partner-facing — not a candidate landing page.
  robots: { index: false, follow: false },
}

export default function FeedsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-xs font-bold tracking-widest text-[#17324D] uppercase mb-3">For distribution partners</p>
        <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-4 text-[#17324D]">Job feeds.</h1>
        <p className="text-gray-700 mb-3 max-w-2xl">
          Public XML / RSS feeds for direct nursing and allied-health employer posts. All feeds are
          open, no auth required, refreshed every 6 hours.
        </p>
        <p className="text-gray-700 mb-10 max-w-2xl">
          Verified direct-employer jobs are added to active default feeds automatically. Gated
          networks stay off until their ingestion channel is active. If you need a different
          format or fields, contact{' '}
          <a href={`mailto:${FREEJOBPOST_SUPPORT_EMAIL}`} className="underline">
            {FREEJOBPOST_SUPPORT_EMAIL}
          </a>.
        </p>

        <div className="space-y-5">
          {SYNDICATION_TARGETS.map((t) => (
            <div key={t.id} className="rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-black">{t.label}</h2>
                <span className="bg-[#17324D] px-2 py-1 font-mono text-[10px] tracking-wider text-white">
                  {t.spec}
                </span>
              </div>
              <p className="mb-2 text-sm text-gray-700">
                {t.blurb} <span className="text-gray-500">· {t.reach}</span>
              </p>
              <a
                href={t.feedUrl}
                className="break-all font-mono text-sm text-[#17324D] underline"
              >
                {t.feedUrl}
              </a>
              <p className="mt-3 text-sm text-gray-600">
                {t.defaultOn
                  ? 'Eligible direct employer posts are included automatically.'
                  : 'The feed stays available for a distribution partner that activates this channel.'}
              </p>
            </div>
          ))}

          {/* Sitemap is special — not a per-job-feed but the crawl-discovery signal */}
          <div className="rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-xl font-black">Sitemap (crawl discovery)</h2>
              <span className="text-[10px] font-mono bg-[#17324D] text-white px-2 py-1 tracking-wider">sitemaps.org 0.9</span>
            </div>
            <p className="text-sm text-gray-700 mb-2">For Google, Bing, DuckDuckGo, and any general-purpose web crawler.</p>
            <a href="https://freejobpost.co/sitemap.xml" className="text-sm font-mono text-[#17324D] underline break-all">https://freejobpost.co/sitemap.xml</a>
          </div>
        </div>

        <div className="mt-12 p-5 border-2 border-dashed border-gray-400">
          <h2 className="font-bold text-lg mb-2">Feed compliance</h2>
          <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">
            <li>All listings link back to <code>freejobpost.co/jobs/[slug]</code> with full job description and apply form.</li>
            <li>Salary fields are present where the employer chose to disclose them.</li>
            <li>Expired/removed jobs are dropped from the feed within 6 hours (next cache cycle).</li>
            <li>Network-specific feeds only list current verified jobs assigned to that target. An empty feed is normal when no current job is eligible. The whole-origin feeds list every eligible direct employer post.</li>
            <li>Each feed emits a job once with a stable <code>slug</code> reference.</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
