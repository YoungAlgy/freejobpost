import Link from 'next/link'
import type { Metadata } from 'next'

import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'Post healthcare jobs free — no Indeed tax, no per-applicant fees',
  description:
    'Free healthcare job posting for hospitals, clinics, and staffing firms. Post RN, MD, NP, PA, PT roles in 60 seconds — no Indeed tax, no auction.',
  alternates: { canonical: 'https://freejobpost.co/for-employers' },
  openGraph: {
    title: 'Post healthcare jobs free | freejobpost.co',
    description:
      'Free healthcare job posting. No credit card, no per-applicant fees, no sponsored bids.',
    url: 'https://freejobpost.co/for-employers',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Post healthcare jobs free | freejobpost.co',
    description:
      'Free healthcare job posting. No credit card, no per-applicant fees, no sponsored bids.',
    images: ['/opengraph-image'],
  },
}

const COST_ROWS = [
  {
    label: 'RN (floor / ICU)',
    indeed: '$400–$900 avg cost per hire',
    freejobpost: '$0',
  },
  {
    label: 'Physician (MD/DO)',
    indeed: '$800–$2,500+ avg cost per hire',
    freejobpost: '$0',
  },
  {
    label: 'NP / PA',
    indeed: '$500–$1,200 avg cost per hire',
    freejobpost: '$0',
  },
  {
    label: 'PT / OT / SLP',
    indeed: '$300–$700 avg cost per hire',
    freejobpost: '$0',
  },
  {
    label: 'Pharmacist',
    indeed: '$600–$1,500 avg cost per hire',
    freejobpost: '$0',
  },
]

const FAQ_ITEMS = [
  {
    q: 'Is it really free — no hidden upgrade tier?',
    a: 'Yes. 10 active posts free, forever — see every applicant\'s full contact info immediately, repost expired roles at no cost. If you need more than 10 simultaneous active slots, email info@avahealth.co and we\'ll uncap your account. If we ever add an optional "boost" feature it will be clearly labeled, never a paywall to see who applied.',
  },
  {
    q: 'How long does a job stay live?',
    a: '60 days by default. You can repost the same role at any time — expired roles don\'t count toward your 10-active-post limit. Filled roles can be marked "closed" to come off the board and free up a slot instantly.',
  },
  {
    q: 'Where does my listing appear besides freejobpost.co?',
    a: 'Every listing gets JobPosting JSON-LD for Google for Jobs (crawled directly by Google), plus our XML/RSS feeds for ZipRecruiter, Adzuna, Jooble, and other aggregators. Indeed and Glassdoor discover listings through crawl — no separate submission needed. Active feed partners ingest within a few hours of posting.',
  },
  {
    q: 'Who applies — real people or scraped profiles?',
    a: "Real candidates. Candidates apply directly from the job page — name, email, phone, optional cover note, optional resume URL. Some candidates also come through the freeresumepost.co matching engine, which shows them new roles that fit their specialty and state. We do not scrape profiles or auto-submit applications on anyone's behalf.",
  },
  {
    q: 'Do I have to create an account or set a password?',
    a: 'No. Post a job, verify your email with a one-click magic link, and you\'re live. Access your dashboard anytime by requesting a new magic link — no password to forget or reset.',
  },
  {
    q: 'Can I post locum, per diem, or travel roles?',
    a: 'Yes — all employment types are supported: full-time, part-time, contract, locum, per diem, and internship. Remote, hybrid, and onsite roles are all accepted.',
  },
  {
    q: 'What roles can I post here?',
    a: 'Clinical and clinical-adjacent US healthcare roles: physicians, NPs, PAs, RNs, CRNAs, LPNs, therapists (PT/OT/SLP/AuD), pharmacists, MAs, lab techs, sonographers, paramedics, and allied health. Non-clinical roles (admin, accounting, marketing) are out of scope.',
  },
  {
    q: 'How does freejobpost.co make money if posting is free?',
    a: 'freejobpost.co is operated by Ava Health Partners LLC, a healthcare staffing firm. We maintain a candidate database for our placement business — the job board populates that database with active candidates. The board doesn\'t need to monetize independently because the upstream placement business already does.',
  },
  {
    q: 'Will you cold-recruit my existing staff or sell applicant data?',
    a: 'No. We don\'t cold-pitch your existing staff, we don\'t resell applicant contact info to third parties, and we don\'t license your job descriptions to competing boards. See our privacy policy for the full breakdown.',
  },
]

export default function ForEmployersPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-lg sm:text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </span>
            <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
              BETA
            </span>
          </Link>
          <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
            <Link href="/jobs" className="hidden sm:inline hover:text-green-700">Browse jobs</Link>
            <Link href="/how-it-works" className="hover:text-green-700">How it works</Link>
            <Link
              href="/post-job"
              className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b-2 border-black">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-8">
            <span className="w-2 h-2 bg-green-600" />
            FOR HEALTHCARE EMPLOYERS
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-[0.92] tracking-tight mb-8">
            Post healthcare jobs free.
            <br />
            <span className="text-green-700">Keep every applicant.</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 max-w-2xl leading-snug mb-10">
            No sponsored-bid auction. No per-applicant charge. No &ldquo;unlock this resume&rdquo;
            fee. Post a role in 60 seconds and applicants hit your inbox directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center bg-black text-white px-8 py-4 text-base font-bold hover:bg-green-700 transition-colors"
            >
              Post a job free →
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center border-2 border-black px-8 py-4 text-base font-bold hover:bg-black hover:text-white transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* The cost comparison */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">THE INDEED TAX</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-6 max-w-3xl">
            The average healthcare hire on Indeed now costs over $500 in sponsored clicks.
          </p>
          <p className="text-gray-700 leading-relaxed mb-10 max-w-2xl">
            Sponsored placement bidding, per-click charges, and pay-to-see-applicants paywalls add up fast.
            Smaller clinics and health systems are paying the same rates as hospital networks just to
            be seen by candidates who were browsing for free. We got tired of it, so we built the alternative.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-3 pr-6 text-xs font-bold tracking-widest">ROLE</th>
                  <th className="text-left py-3 pr-6 text-xs font-bold tracking-widest text-gray-600">INDEED SPONSORED (typical)</th>
                  <th className="text-left py-3 text-xs font-bold tracking-widest text-green-700">FREEJOBPOST.CO</th>
                </tr>
              </thead>
              <tbody>
                {COST_ROWS.map((row, i) => (
                  <tr key={row.label} className={`border-b ${i < COST_ROWS.length - 1 ? 'border-gray-200' : 'border-black'}`}>
                    <td className="py-4 pr-6 font-bold">{row.label}</td>
                    <td className="py-4 pr-6 text-gray-700">{row.indeed}</td>
                    <td className="py-4 font-black text-green-700">{row.freejobpost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Indeed sponsored cost estimates based on published industry benchmarks for healthcare roles (2023-2025). Actual costs vary by location, specialty, and bid competition.
          </p>
        </div>
      </section>

      {/* How it works — employer-specific */}
      <section className="border-b-2 border-black">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">HOW IT WORKS</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-16">
            Post in 60 seconds. Applicants in your inbox.
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                n: '01',
                h: 'Fill the form',
                p: 'Title, location, employment type, salary range, and a brief description. No account setup, no credit card.',
              },
              {
                n: '02',
                h: 'Verify your email',
                p: 'We send you a one-click magic link. Click it and your listing goes live — visible on freejobpost.co and in our syndication feeds.',
              },
              {
                n: '03',
                h: 'Candidates find you',
                p: 'Via the job board, the freeresumepost.co matching engine (which surfaces fitting roles to candidates), and feed-based aggregators.',
              },
              {
                n: '04',
                h: 'They apply to you directly',
                p: 'Applicant contact info lands in your inbox. No middleman, no "unlock" fee, no dashboard login required to see who applied.',
              },
            ].map((step) => (
              <div key={step.n} className="border-2 border-black p-6">
                <div className="text-green-700 font-black text-xs tracking-widest mb-3">{step.n}</div>
                <h3 className="font-black text-xl tracking-tight mb-3">{step.h}</h3>
                <p className="text-gray-700 leading-relaxed text-sm">{step.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Where does it go */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">DISTRIBUTION</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-6 max-w-3xl">
            One post, multiple channels.
          </p>
          <p className="text-gray-700 leading-relaxed mb-10 max-w-2xl">
            Every listing you check for syndication goes into our public XML feeds and gets
            JobPosting JSON-LD for Google for Jobs. You control which networks see it via the
            checkboxes in the posting form.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { name: 'Google for Jobs', status: 'Active', note: 'JobPosting JSON-LD on every listing page — auto-indexed by Google' },
              { name: 'Indeed', status: 'Active', note: 'Organic crawl of JobPosting JSON-LD — no sponsored required' },
              { name: 'Glassdoor', status: 'Active', note: 'Indeed-owned; same auto-crawl pipeline' },
              { name: 'Adzuna', status: 'Feed live', note: 'Feed submitted — partnership in review' },
              { name: 'ZipRecruiter', status: 'Feed live', note: 'Feed submitted — pending Open Network acceptance' },
              { name: 'Jooble', status: 'Feed live', note: 'Feed submitted — pending acceptance' },
            ].map((ch) => (
              <div key={ch.name} className="border-2 border-black bg-white p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-base">{ch.name}</span>
                  <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 ${
                    ch.status === 'Active' ? 'bg-green-600 text-white' : 'border border-black text-gray-700'
                  }`}>
                    {ch.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-600">{ch.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="border-b-2 border-black">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">VS THE ALTERNATIVES</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-12 max-w-3xl">
            What you don&apos;t pay for.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border-2 border-gray-300 p-6">
              <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-4">Indeed Sponsored</div>
              <ul className="space-y-2.5 text-sm text-gray-700">
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> $0.10–$5.00 per click auction</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> Posts buried below paid placements</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> Candidate emails resold to other recruiters</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> $300–$2,500+ average cost per healthcare hire</li>
              </ul>
            </div>
            <div className="border-2 border-gray-300 p-6">
              <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-4">ZipRecruiter Paid</div>
              <ul className="space-y-2.5 text-sm text-gray-700">
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> $299–$599+/month subscription</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> Traffic-boosted plans for extra reach</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> Monthly billing even for slow hiring periods</li>
                <li className="flex gap-2"><span className="font-black text-gray-400">✕</span> Candidate profiles sold to multiple employers simultaneously</li>
              </ul>
            </div>
            <div className="border-2 border-green-700 bg-green-50 p-6">
              <div className="text-xs font-bold tracking-wider text-green-700 uppercase mb-4">freejobpost.co</div>
              <ul className="space-y-2.5 text-sm text-gray-800">
                <li className="flex gap-2"><span className="font-black text-green-700">✓</span> $0 — free to post, free to see applicants</li>
                <li className="flex gap-2"><span className="font-black text-green-700">✓</span> No bid auction — all organic listings</li>
                <li className="flex gap-2"><span className="font-black text-green-700">✓</span> Applicant contact info goes to you only</li>
                <li className="flex gap-2"><span className="font-black text-green-700">✓</span> Free forever — no trial that auto-converts</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Indeed and ZipRecruiter pricing based on published rate cards and industry reports. Actual costs vary. See their sites for current pricing.
          </p>
        </div>
      </section>

      {/* Why free */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">WHY FREE?</h2>
          <p className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-6">
            The board feeds our recruiting business. Not the other way around.
          </p>
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              freejobpost.co is operated by{' '}
              <a href="https://avahealth.co" className="underline font-bold hover:text-green-700">
                Ava Health Partners LLC
              </a>
              , a healthcare staffing firm. We maintain a candidate database for our placement
              business — the job board populates that database with active candidates who are
              genuinely looking.
            </p>
            <p>
              The placement-fee model upstream covers infrastructure costs. The board doesn&apos;t
              need to monetize directly, so we don&apos;t charge employers to post or charge
              candidates to apply.
            </p>
            <p>
              We don&apos;t cold-recruit your existing staff. We don&apos;t resell your applicants to
              competing recruiters. We don&apos;t pitch every candidate we touch on working with us
              exclusively. The incentives are clean.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">EMPLOYER FAQ</h2>
          <p className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-12">
            Common questions.
          </p>
          <div className="space-y-8">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q}>
                <h3 className="text-lg font-black mb-2">{item.q}</h3>
                <p className="text-gray-700 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-b-2 border-black bg-black text-white">
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <p className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-8">
            Post your first role.
            <br />
            <span className="text-green-500">60 seconds. $0.</span>
          </p>
          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-10">
            No account setup. No credit card. No sales call. Just fill the form and you&apos;re live.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center bg-green-600 text-black px-8 py-5 text-lg font-black hover:bg-green-500 transition-colors"
            >
              Post a job free →
            </Link>
            <a
              href="mailto:info@avahealth.co?subject=freejobpost.co%20employer%20question"
              className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-5 text-lg font-bold hover:bg-white hover:text-black transition-colors"
            >
              Questions? Email us
            </a>
          </div>
          <p className="mt-8 text-sm text-gray-400">
            Operated by Ava Health Partners LLC · Tampa, FL ·{' '}
            <Link href="/privacy" className="underline hover:text-white">
              Privacy policy
            </Link>
          </p>
        </div>
      </section>

      {/* BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
              { '@type': 'ListItem', position: 2, name: 'For employers', item: 'https://freejobpost.co/for-employers' },
            ],
          }),
        }}
      />

</main>
  )
}
