import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing — free healthcare job posting for verified orgs',
  description:
    'Free forever for verified healthcare orgs (3 active posts). Plus $49/mo for 15 posts + featured placement. Pro $199/mo for unlimited + analytics. 10-25× cheaper than Indeed sponsored, LinkedIn Recruiter, or ZipRecruiter.',
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
  features: Array<{ text: string; included: boolean }>
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    priceDetail: 'forever',
    tagline: 'Verified healthcare orgs',
    cta: 'Post a job →',
    ctaHref: '/post-job',
    features: [
      { text: '3 active job posts', included: true },
      { text: '60-day post duration', included: true },
      { text: 'Email verification required', included: true },
      { text: 'Healthcare-org verification (auto or 1-day review)', included: true },
      { text: 'Google for Jobs + Indeed free feed syndication', included: true },
      { text: 'Candidate applications delivered to your inbox', included: true },
      { text: 'Featured placement', included: false },
      { text: 'Resume search', included: false },
    ],
  },
  {
    name: 'Plus',
    price: '$49',
    priceDetail: '/mo · or $490/yr',
    tagline: 'Small practices & group clinics',
    cta: 'Upgrade when ready',
    ctaHref: '/post-job',
    features: [
      { text: '15 active job posts', included: true },
      { text: '90-day post duration', included: true },
      { text: '3 featured-placement boosts / month', included: true },
      { text: 'Apply-tracking dashboard + CSV export', included: true },
      { text: '5-minute feed refresh (vs 15 min)', included: true },
      { text: 'Priority email support', included: true },
      { text: 'Unlimited posts', included: false },
      { text: 'Resume search', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '$199',
    priceDetail: '/mo · or $1,990/yr',
    tagline: 'Mid-market orgs & staffing teams',
    cta: 'Upgrade when ready',
    ctaHref: '/post-job',
    highlight: true,
    features: [
      { text: 'Unlimited active job posts', included: true },
      { text: '90-day post duration', included: true },
      { text: 'Unlimited featured placements', included: true },
      { text: 'Full analytics + source attribution', included: true },
      { text: 'Resume search (opted-in candidates)', included: true },
      { text: 'Saved candidate searches + email alerts', included: true },
      { text: 'Apply-tracking + CSV export', included: true },
      { text: 'Priority support', included: true },
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceDetail: 'from $999/mo',
    tagline: 'Hospital systems & staffing agencies',
    cta: 'Talk to us',
    ctaHref: 'mailto:ally@avahealth.co?subject=Enterprise%20job%20board%20inquiry',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'ATS integration (Bullhorn, JobDiva, Avionte)', included: true },
      { text: 'API access', included: true },
      { text: 'White-label option', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: '1-hour review SLA for new posts', included: true },
      { text: 'Custom reporting + SSO', included: true },
      { text: 'Annual contract', included: true },
    ],
  },
]

const COMPARE_ROWS = [
  { platform: 'freejobpost.co Pro', yearly: '$1,990', per10jobs: '$199/mo' },
  { platform: 'Indeed sponsored (10 roles)', yearly: '$36,000+', per10jobs: '$3,000/mo' },
  { platform: 'LinkedIn Recruiter Corporate (1 seat + boosts)', yearly: '$14,000+', per10jobs: '$1,167/mo' },
  { platform: 'ZipRecruiter (10 roles)', yearly: '$60,000+', per10jobs: '$5,000/mo' },
  { platform: 'Health eCareers ($499/post × 10)', yearly: '$5,988', per10jobs: '$499/mo' },
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
            PRICING · HEALTHCARE HIRING REBUILT
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-6">
            The price of Indeed
            <br />
            just went to{' '}
            <span className="text-green-700">$∞</span>.
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl leading-snug text-gray-800 mb-4">
            On March 31, 2026, Indeed eliminated free organic visibility for
            jobs fed without a paid ATS+Indeed Apply integration. Healthcare
            orgs are replatforming. This is where.
          </p>
          <p className="text-lg text-gray-600 max-w-2xl">
            Free forever for verified healthcare orgs. Paid tiers for teams
            posting at volume — still 10–25× below Indeed, LinkedIn, or
            ZipRecruiter.
          </p>
        </div>
      </section>

      {/* Tiers grid */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-0 md:gap-0 md:divide-x-2 md:divide-black border-2 border-black">
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
                <h2 className="font-black text-2xl tracking-tight mb-1">{tier.name}</h2>
                <p className="text-xs text-gray-600 mb-4">{tier.tagline}</p>
                <div className="mb-6">
                  <span className="text-5xl font-black tracking-tight">{tier.price}</span>
                  {tier.priceDetail && (
                    <div className="text-sm text-gray-600 mt-1">{tier.priceDetail}</div>
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
                  {tier.features.map((f, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2 ${f.included ? '' : 'text-gray-400 line-through'}`}
                    >
                      <span
                        className={`shrink-0 w-4 h-4 mt-0.5 flex items-center justify-center font-bold ${
                          f.included ? 'text-green-700' : 'text-gray-400'
                        }`}
                      >
                        {f.included ? '✓' : '×'}
                      </span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm text-gray-600 max-w-3xl">
            Paid tier checkout is launching shortly — for now, post on the free
            tier and we&apos;ll upgrade you manually when you need more slots.
            Enterprise inquiries:{' '}
            <a
              href="mailto:ally@avahealth.co"
              className="font-bold underline hover:text-green-700"
            >
              ally@avahealth.co
            </a>
            .
          </p>
        </div>
      </section>

      {/* Side-by-side vs competitors */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">
            THE MATH
          </h2>
          <p className="text-3xl md:text-5xl font-black leading-tight tracking-tight mb-10 max-w-4xl">
            What 10 roles costs per year,
            <br />
            on each platform.
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
                {COMPARE_ROWS.map((row, i) => (
                  <tr
                    key={row.platform}
                    className={i === 0 ? 'bg-green-50 font-bold' : ''}
                  >
                    <td className="p-4">{row.platform}</td>
                    <td className="p-4 text-right font-mono">{row.per10jobs}</td>
                    <td className="p-4 text-right font-mono">{row.yearly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Sources: Indeed pricing guide (2026), LinkedIn Recruiter pricing, ZipRecruiter cost data, Health eCareers publisher rate card. Mid-market healthcare org with ~10 concurrent open roles.
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
              q="Why is there a free tier at all?"
              a="Because healthcare orgs with 1–10 staff can't absorb $3K/mo Indeed sponsored budgets, and we think they deserve to hire. Free covers the small-clinic use case so the supply side stays broad. Paid tiers (Plus, Pro) pay the bills."
            />
            <Faq
              q="Why a 3-post limit on free? Isn't that too tight?"
              a="Active posts, not lifetime. A clinic filling 2 roles uses 2 slots briefly — once filled, mark them closed and the slots reopen. A 10-person practice typically has 0–3 roles open at any time. If you consistently have more than 3 open, you're a Plus tier customer."
            />
            <Faq
              q="What's the 'verified healthcare org' gate?"
              a="We check whether your email domain or company matches a real healthcare org in the NPPES registry, a hospital system, or a known practice. Most verify automatically in seconds. Those that don't go to a queue our team reviews within a day. The gate is what keeps the candidate experience clean — no fake listings, no affiliate-marketing spam."
            />
            <Faq
              q="What about Indeed's change specifically?"
              a="On March 31, 2026, Indeed pulled free organic visibility from XML/API feeds that don't use a paid ATS+Indeed Apply combination. Healthcare was called out as a field where sponsored will be required to fill roles. Translation: the free lane you were using is closed. We're building the replacement."
            />
            <Faq
              q="Will you syndicate to Indeed anyway?"
              a="Yes — our feed is Indeed-compatible and we submit to their free organic program. Whether Indeed chooses to index it is increasingly up to them. Our Google for Jobs distribution, SEO strategy, and ZipRecruiter feed don't depend on Indeed cooperating."
            />
            <Faq
              q="Can I post without being a healthcare org?"
              a="The platform is healthcare-only for now. Non-healthcare posts are rejected during the verification review. When we expand to other verticals (tech, admin, etc.), we'll announce it."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <p className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-8">
            Post your first role.
            <br />
            <span className="text-green-500">Free.</span>
          </p>
          <Link
            href="/post-job"
            className="inline-flex items-center bg-green-600 text-black px-8 py-5 text-lg font-black hover:bg-green-500 transition-colors"
          >
            Post a job →
          </Link>
          <p className="mt-6 text-sm text-gray-400">
            90 seconds. Email-verified. Live in your SEO + Google for Jobs the moment you confirm.
          </p>
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
