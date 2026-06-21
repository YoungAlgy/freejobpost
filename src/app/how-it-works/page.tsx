import type { Metadata } from 'next'
import Link from 'next/link'

import { safeJsonLd } from '@/lib/safe-jsonld'
export const metadata: Metadata = {
  title: 'How it works',
  description: 'How freejobpost.co works: free healthcare job posts, no auction, no paywall, no recruiter spam. The 60-second post flow + everything that happens after.',
  alternates: { canonical: 'https://freejobpost.co/how-it-works' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'How freejobpost.co works',
    description:
      'Free healthcare job posts, no auction, no paywall. Post in 60 seconds.',
    url: 'https://freejobpost.co/how-it-works',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How freejobpost.co works',
    description:
      'Free healthcare job posts, no auction, no paywall. Post in 60 seconds.',
    images: ['/opengraph-image'],
  },
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="inline-flex items-center gap-2 border border-gray-200 px-3 py-1 text-xs font-bold tracking-wider mb-6 rounded-md">
          <span className="w-2 h-2 bg-[#7FBC00]" />
          HOW IT WORKS
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-6 text-[#003D5C]">
          Free healthcare job posts.<br />
          <span className="text-[#003D5C]">No fees, no auction.</span>
        </h1>
        <p className="text-lg text-gray-700 leading-relaxed mb-12">
          Ava Health is a plain utility. We don&apos;t charge employers, we don&apos;t auction
          visibility, we don&apos;t sell candidate emails. Here&apos;s how it actually works.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3 text-[#003D5C]">For employers</h2>
        <ol className="space-y-5 mb-12">
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#003D5C] text-white text-sm font-black flex items-center justify-center rounded-md">1</div>
            <div>
              <div className="font-black text-lg mb-1">Fill the 60-second form</div>
              <div className="text-gray-700">Title, role, location, comp, description. No account, no credit card.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#003D5C] text-white text-sm font-black flex items-center justify-center rounded-md">2</div>
            <div>
              <div className="font-black text-lg mb-1">Verify your email (one click)</div>
              <div className="text-gray-700">We email you a magic link. Click it and your job is live. No password to remember.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#003D5C] text-white text-sm font-black flex items-center justify-center rounded-md">3</div>
            <div>
              <div className="font-black text-lg mb-1">Get applicants in your inbox</div>
              <div className="text-gray-700">Real candidates apply directly to you. No screening fee, no upsell, no &quot;unlock this resume&quot; charge. We&apos;re not in the loop.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#003D5C] text-white text-sm font-black flex items-center justify-center rounded-md">4</div>
            <div>
              <div className="font-black text-lg mb-1">Manage from your free dashboard</div>
              <div className="text-gray-700">All your posts, applicant counts, and status, all at <Link href="/employer" className="underline hover:text-[#003D5C]">/employer</Link>. Magic-link login, no password.</div>
            </div>
          </li>
        </ol>

        <h2 className="text-2xl font-black tracking-tight mb-3 text-[#003D5C]">For candidates</h2>
        <ol className="space-y-5 mb-12">
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#7FBC00] text-white text-sm font-black flex items-center justify-center rounded-md">1</div>
            <div>
              <div className="font-black text-lg mb-1">Browse jobs (no account)</div>
              <div className="text-gray-700">Filter by role, state, employment type. Pure list, no &quot;featured&quot; ads burying organic posts.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#7FBC00] text-white text-sm font-black flex items-center justify-center rounded-md">2</div>
            <div>
              <div className="font-black text-lg mb-1">Apply directly to the employer</div>
              <div className="text-gray-700">Name, email, phone, optional resume URL, optional note. Goes straight to the employer&apos;s inbox.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-[#7FBC00] text-white text-sm font-black flex items-center justify-center rounded-md">3</div>
            <div>
              <div className="font-black text-lg mb-1">Want a profile that auto-matches?</div>
              <div className="text-gray-700">Upload your resume at <a href="https://www.freeresumepost.co/upload" className="underline hover:text-[#003D5C]">freeresumepost.co</a>. We&apos;ll email you when a 70%+ match opens that fits your specialty + state.</div>
            </div>
          </li>
        </ol>

        <h2 className="text-2xl font-black tracking-tight mb-3 text-[#003D5C]">vs the alternatives</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-12">
          <div className="rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Sponsored boards</div>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li>· $0.10-$5.00 per click bid</li>
              <li>· Posts demoted below paid ads</li>
              <li>· Candidate emails resold to recruiters</li>
              <li>· Average cost per role: $300+</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[#7FBC00] bg-[#7FBC00]/10 shadow-sm p-5">
            <div className="text-xs font-bold tracking-wider text-[#003D5C] uppercase mb-2">Ava Health</div>
            <ul className="space-y-1.5 text-sm text-gray-800 font-medium">
              <li>· $0. No fees, ever</li>
              <li>· Same indexing, no demotion</li>
              <li>· Candidate emails go to you only</li>
              <li>· 10 active posts free. No auction, no upgrade required</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-600 mb-12">
          Every listing gets JobPosting JSON-LD for Google for Jobs, plus our{' '}
          <a href="/jobs.xml" className="underline hover:text-[#003D5C]">public XML/RSS feed</a>{' '}
          for ZipRecruiter, Adzuna, Jooble, and other aggregators.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3 text-[#003D5C]">Why is this free?</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          Ava Health is operated by Ava Health Partners LLC, a healthcare staffing firm. We
          maintain a candidate database for our placement business. The job board feeds candidates
          into that database; the database fuels our recruiting. The board itself doesn&apos;t need to
          monetize because the upstream business already does.
        </p>
        <p className="text-gray-700 leading-relaxed mb-12">
          We don&apos;t spam your applicants. We don&apos;t cold-recruit your existing staff. We don&apos;t resell
          your job posts to competing sites. Read our <Link href="/privacy" className="underline hover:text-[#003D5C]">privacy policy</Link> for the specifics.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3 text-[#003D5C]">FAQ</h2>
        <div className="space-y-6 mb-12">
          <div>
            <h3 className="font-black mb-1">Is it really free to post a job?</h3>
            <p className="text-gray-700">Yes. No fees, no credit card, no trial period that quietly converts. We don&apos;t charge employers because the upstream Ava Health recruiting business already monetizes its candidate database. The job board feeds that database.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">How long does a posted job stay live?</h3>
            <p className="text-gray-700">60 days by default. You can repost the same role anytime. We don&apos;t cap the number of postings per employer.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Will my job appear on Indeed and Google for Jobs?</h3>
            <p className="text-gray-700">Yes. Every job page includes JobPosting structured data that Google for Jobs indexes within hours. Indeed discovers listings through its own organic crawler. No separate submission needed. We also publish a public XML/RSS feed at /jobs.xml used by ZipRecruiter, Adzuna, Jooble, and other aggregators.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Do you sell my company name or contact info?</h3>
            <p className="text-gray-700">No. We don&apos;t resell employer data, we don&apos;t cold-pitch your existing staff, and we don&apos;t hand your applicants to competing recruiters. See our privacy policy for the specifics.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Who can post a job here?</h3>
            <p className="text-gray-700">US-based healthcare employers: hospitals, private groups, FQHCs, urgent cares, telehealth providers, locum agencies, and pharmacies. We don&apos;t accept third-party staffing-agency reposts or expired roles.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">What roles can I post?</h3>
            <p className="text-gray-700">All clinical and clinical-adjacent healthcare roles: physicians, NPs, PAs, RNs, CRNAs, therapists (PT, OT, SLP, AuD), pharmacists, and allied health. We don&apos;t accept non-clinical roles (admin, accounting, marketing) at this time.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">How fast does my job get listed?</h3>
            <p className="text-gray-700">Instant. Submit the form and it&apos;s live within seconds. Google for Jobs typically indexes new postings within a few hours. Aggregator feeds (ZipRecruiter, Adzuna, Jooble) pick up new listings within a few hours of posting.</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-[#003D5C] text-white p-8 text-center shadow-sm">
          <p className="text-2xl font-black mb-3">Ready?</p>
          <Link href="/post-job" className="inline-block bg-[#7FBC00] text-white font-bold px-6 py-3 rounded-md hover:bg-[#6DA300]">
            Post a job free →
          </Link>
        </div>
      </article>

      {/* BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
              { '@type': 'ListItem', position: 2, name: 'How it works', item: 'https://freejobpost.co/how-it-works' },
            ],
          }),
        }}
      />

</main>
  )
}
