import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — free healthcare job posting, $29/mo unlimited',
  description:
    '10 free job posts forever for verified healthcare orgs. $29/mo for unlimited. No feature gating, no per-post fees, no auction. 17× cheaper than Health eCareers, 100× cheaper than Indeed sponsored.',
  alternates: { canonical: 'https://freejobpost.co/pricing' },
}

type Tier = {
  name: string
  price: string
  priceDetail?: string
  tagline: string
  cta: string
  ctaHref: string
  highlight?: boolean
  bullets: string[]
  footnote?: string
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    priceDetail: 'forever',
    tagline: 'Verified healthcare orgs',
    cta: 'Post a job →',
    ctaHref: '/post-job',
    bullets: [
      '10 active job posts',
      '90-day post duration',
      'All features included — apply-tracking, CSV export, analytics',
      '1 featured placement boost / month',
      'Google for Jobs + Indeed feed syndication',
      'Healthcare-org verification (auto or 1-day review)',
      'Email-verified posting',
    ],
    footnote: 'No credit card required. Cancel anytime — there\u2019s nothing to cancel.',
  },
  {
    name: 'Pro',
    price: '$29',
    priceDetail: '/mo · or $290/yr (save 2 months)',
    tagline: 'Staffing teams + volume hirers',
    cta: 'Upgrade when ready',
    ctaHref: '/post-job',
    highlight: true,
    bullets: [
      'Unlimited active posts',
      'Unlimited featured placements',
      'Resume search (opted-in candidates)',
      'Saved searches + email alerts on new matches',
      'Priority 5-min feed refresh (vs 15 min)',
      'Priority email support',
      'Everything in Free, no limits',
    ],
    footnote: 'Flat pricing. No per-post fees, no auction, no feature paywalls.',
  },
  {
    name: 'Enterprise',
    price: 'from $299',
    priceDetail: '/mo · custom',
    tagline: 'Hospital systems + agencies',
    cta: 'Talk to us',
    ctaHref: 'mailto:ally@avahealth.co?subject=Enterprise%20job%20board%20inquiry',
    bullets: [
      'Everything in Pro',
      'ATS integration (Bullhorn, JobDiva, Avionte)',
      'API access + white-label option',
      'Dedicated account manager',
      '1-hour review SLA for new posts',
      'Custom reporting + SSO',
      'Annual contract',
    ],
  },
]

const COMPARE_ROWS = [
  { platform: 'freejobpost.co Pro', yearly: '$290', per10jobs: '$29/mo', highlight: true },
  { platform: 'Health eCareers ($499/post × 10)', yearly: '$4,990', per10jobs: '$499/mo' },
  { platform: 'LinkedIn Recruiter Corporate (1 seat + boosts)', yearly: '$14,000+', per10jobs: '$1,167/mo' },
  { platform: 'Indeed sponsored (10 roles, typical CPC)', yearly: '$36,000+', per10jobs: '$3,000/mo' },
  { platform: 'ZipRecruiter (10 roles)', yearly: '$60,000+', per10jobs: '$5,000/mo' },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </span>
            <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
              BETA
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link href="/jobs" className="hover:text-green-700">
              Browse jobs
            </Link>
            <Link href="/pricing" className="hover:text-green-700 border-b-2 border-black">
              Pricing
            </Link>
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
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
            <span className="w-2 h-2 bg-green-600" />
            FLAT PRICING · NO FEATURE PAYWALLS
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
            10 free posts.
            <br />
            Or <span className="text-green-700">$29/mo</span>.
            <br />
            That&apos;s it.
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl leading-snug text-gray-800 mb-4">
            Every feature is in every tier. You pay for volume, not for
            apply-tracking, not for analytics, not for CSV export. The other
            guys nickel-and-dime because they can. We&apos;re not them.
          </p>
          <p className="text-lg text-gray-600 max-w-2xl">
            Healthcare orgs are leaving Indeed, LinkedIn, and ZipRecruiter
            because the pricing broke. We built freejobpost.co to be the
            obvious replacement — for real.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-3 gap-0 md:divide-x-2 md:divide-black border-2 border-black">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`p-8 ${tier.highlight ? 'bg-green-50' : 'bg-white'}`}
              >
                {tier.highlight && (
                  <div className="inline-flex items-center gap-2 bg-black text-white text-[10px] font-bold tracking-wider px-2 py-1 mb-4">
                    MOST POPULAR
                  </div>
                )}
                <h2 className="font-black text-3xl tracking-tight mb-1">{tier.name}</h2>
                <p className="text-xs text-gray-600 mb-6">{tier.tagline}</p>
                <div className="mb-6">
                  <span className="text-6xl font-black tracking-tight">{tier.price}</span>
                  {tier.priceDetail && (
                    <div className="text-sm text-gray-600 mt-2">{tier.priceDetail}</div>
                  )}
                </div>
                <Link
                  href={tier.ctaHref}
                  className={`block text-center font-bold py-3 mb-6 border-2 border-black transition-colors ${
                    tier.highlight
                      ? 'bg-black text-white hover:bg-green-700'
                      : 'bg-white hover:bg-black hover:text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
                <ul className="space-y-3 text-sm">
                  {tier.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center font-bold text-green-700">
                        ✓
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                {tier.footnote && (
                  <p className="mt-6 text-xs text-gray-500 italic">{tier.footnote}</p>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-gray-600 max-w-3xl">
            Pro checkout launching shortly. In the meantime post on Free —
            the moment you need to upgrade, email{' '}
            <a href="mailto:ally@avahealth.co" className="font-bold underline hover:text-green-700">
              ally@avahealth.co
            </a>
            {' '}and we&apos;ll flip your tier manually.
          </p>
        </div>
      </section>

      {/* The math */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">
            THE MATH
          </h2>
          <p className="text-3xl md:text-5xl font-black leading-tight tracking-tight mb-6 max-w-4xl">
            What 10 open roles costs
            <br />
            per year, on each platform.
          </p>
          <p className="text-lg text-gray-700 mb-10 max-w-2xl">
            The numbers below are what your 50-person clinic actually pays
            today if you stay on the incumbents. And why calls with us are
            getting shorter.
          </p>
          <div className="overflow-x-auto border-2 border-black bg-white">
            <table className="w-full text-left">
              <thead className="border-b-2 border-black">
                <tr>
                  <th className="p-4 text-xs font-bold tracking-wider uppercase">Platform</th>
                  <th className="p-4 text-xs font-bold tracking-wider uppercase text-right">
                    Per 10 jobs / month
                  </th>
                  <th className="p-4 text-xs font-bold tracking-wider uppercase text-right">
                    Per year
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {COMPARE_ROWS.map((row) => (
                  <tr
                    key={row.platform}
                    className={row.highlight ? 'bg-green-50 font-bold' : ''}
                  >
                    <td className="p-4">{row.platform}</td>
                    <td className="p-4 text-right font-mono">{row.per10jobs}</td>
                    <td className="p-4 text-right font-mono">{row.yearly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-gray-500 max-w-3xl">
            Sources: Indeed pricing guide (2026), LinkedIn Recruiter pricing, ZipRecruiter public rate card, Health eCareers publisher pricing. 10 open roles assumed concurrent across a 12-month hiring cycle.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-black">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">FAQ</h2>
          <p className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-12">
            The honest answers.
          </p>
          <div className="space-y-10">
            <Faq
              q="Why is free... actually free?"
              a="Because our marginal cost per employer is a few cents per month. The big platforms price for maximizing revenue per seat; we price for sustainable growth. 10 free active posts covers 95% of healthcare orgs that have ever opened an Indeed account. The gate isn't pricing — it's healthcare verification."
            />
            <Faq
              q="What's the catch on $29 Pro?"
              a="No catch. Same features as free, just uncapped posts + featured placements + resume search. At $29/mo we make ~$22 net after Stripe fees and ops. That's plenty for a calm, profitable business. If we wanted to price-gouge we'd be LinkedIn."
            />
            <Faq
              q="Why no Plus tier in the middle?"
              a="Feature gating is what we're trying to kill. If the free tier gets CSV export, analytics, and apply-tracking, there's nothing to put in a $49 Plus tier that isn't 'pay us for nothing.' Free → Pro is the real choice: do you need more than 10 active posts, or not?"
            />
            <Faq
              q="Will you raise prices once you have users?"
              a="Grandfathered pricing for every account. If you sign up at $29/mo, you stay at $29/mo forever — same way Hover.com did with their flat domain pricing. This is a commitment, not a promotional tactic."
            />
            <Faq
              q="What's the 'verified healthcare org' gate?"
              a="We check if your email domain or company matches a real healthcare organization — NPPES registry, known hospital systems, or domain heuristics (words like 'health', 'clinic', 'medical'). Most clinics verify in seconds. Anything ambiguous goes to a queue our team reviews within a day. It's what keeps the candidate experience spam-free."
            />
            <Faq
              q="What about Indeed's March 2026 change?"
              a="Indeed eliminated free organic visibility on March 31, 2026 for jobs fed without a paid ATS+Indeed Apply integration. Healthcare was called out as a field where sponsored budgets will be mandatory. A lot of small practices had been leaning on that free lane; it's gone. We're building the replacement."
            />
            <Faq
              q="Does this syndicate to Indeed anyway?"
              a="Yes. Our XML feed is Indeed-compatible. Whether Indeed indexes it is Indeed's call under their new policy, but Google for Jobs, ZipRecruiter partner feed, LinkedIn Limited Listings, and direct SEO from our own /jobs pages don't depend on Indeed cooperating."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <p className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-8">
            10 jobs, free, right now.
          </p>
          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10">
            No credit card. No sales call. Email verify, post, live in Google
            for Jobs within 24 hours.
          </p>
          <Link
            href="/post-job"
            className="inline-flex items-center bg-green-600 text-black px-8 py-5 text-lg font-black hover:bg-green-500 transition-colors"
          >
            Post a job →
          </Link>
        </div>
      </section>
    </main>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <h3 className="font-black text-xl md:text-2xl tracking-tight mb-3">{q}</h3>
      <p className="text-gray-700 leading-relaxed">{a}</p>
    </div>
  )
}
