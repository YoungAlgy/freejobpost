import Link from 'next/link'
import type { Metadata } from 'next'
import { safeJsonLd } from '@/lib/safe-jsonld'

export const metadata: Metadata = {
  title: 'How posting works',
  description:
    'Healthcare orgs get 10 free job posts, forever. No auction, no credit card. Here is how it works and what to do if you need more slots.',
  alternates: { canonical: 'https://freejobpost.co/pricing' },
  openGraph: {
    title: 'How posting works | freejobpost.co',
    description:
      '10 free healthcare job posts, forever. No auction, no credit card.',
    url: 'https://freejobpost.co/pricing',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How posting works | freejobpost.co',
    description:
      '10 free healthcare job posts, forever. No auction, no credit card.',
    images: ['/opengraph-image'],
  },
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
          How posting works
        </p>
        <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-8 text-[#003D5C]">
          10 free posts. Forever.
          <br />
          Yes, really.
        </h1>
        <p className="text-lg md:text-xl text-gray-700 leading-relaxed mb-4 max-w-2xl">
          Ava Health is a healthcare hiring utility. Verified
          healthcare orgs get 10 active job posts, 60 days each, with every
          feature unlocked. If you need more, we figure it out together.
          That&apos;s the whole thing.
        </p>
        <p className="text-sm text-gray-500 mb-16">
          Last updated: May 2026
        </p>

        {/* FAQ-style sections */}
        <div className="space-y-14">
          <Section
            q="What do I get for free?"
            a={[
              '10 active job posts at any given time.',
              "60-day post duration (longer than the big boards' organic).",
              'Every feature: apply-tracking dashboard, per-job view and apply counts, no paywall anywhere.',
              'JobPosting JSON-LD on every listing page for Google for Jobs and Indeed organic (direct crawl, no submission needed), plus XML feeds for ZipRecruiter, Adzuna, and Jooble. Active partnerships come online as the network grows.',
              'Your own permanent URL: freejobpost.co/jobs/<your-role-slug>.',
            ]}
          />

          <Section
            q="What does 'active' mean?"
            a={[
              'A post is active from the moment you verify your email until one of three things happens: it expires after 60 days, you archive it as filled, or you delete it.',
              'Archiving a filled role is a one-click action from your employer dashboard. It frees a slot instantly so you can post the next one.',
              'Most healthcare orgs cycle through way fewer than 10 at a time, so the cap rarely matters in practice.',
            ]}
          />

          <Section
            q="What if I need more than 10 slots?"
            a={[
              'Email info@avahealth.co. We manually flip your account to uncapped. No credit card required during beta. We just need to know who we\'re working with.',
              'When paid checkout lands post-beta, the price is $29/month for unlimited posts and $299/month for full ATS integration + API + white-label. Grandfathered for anyone who signs up during beta.',
              "We built this to be cheaper than every alternative (~$29/mo vs the sponsored boards' $3,000/mo typical for 10 sponsored roles). Our cost to serve you is a few pennies a month.",
            ]}
          />

          <Section
            q="Why gate it on 'verified healthcare org' at all?"
            a={[
              'Because a totally-open free tier turns into a spam board overnight, and that wrecks the experience for candidates looking for real roles.',
              'The verification check runs automatically against your email domain and company name. ~95% of real clinics verify in seconds. Edge cases go to a 1-day manual review by our team.',
              'No paperwork, no fax forms, no sales call.',
            ]}
          />

          <Section
            q="What\'s the catch?"
            a={[
              'No catch. This product exists because Indeed just eliminated free organic visibility on March 31, 2026, and healthcare orgs we work with were getting hit with $3K+/month bills to post 10 jobs. We thought that was absurd.',
              'We\'re sustained by the much larger Ava Health recruiting business. This board is top-of-funnel for that. Even if zero people ever upgrade, the platform pays for itself in candidate flow.',
              'Grandfathered pricing is our commitment: if you join at the current rate, that\'s your rate for as long as you have the account. No surprise increases.',
            ]}
          />

          <Section
            q="How does this compare to what we pay now?"
            a={[
              'For a 10-role healthcare org, typical annual spend on the incumbents is:',
              '• Health eCareers: $4,990/yr ($499/post × 10 rollover)',
              '• LinkedIn Recruiter Corporate: $14,000+ (1 seat + boosts)',
              '• Sponsored boards: $36,000+ (typical CPC × 10 concurrent)',
              '• ZipRecruiter: $60,000+ (daily rate × 10 slots)',
              '• freejobpost.co: $0 at 10 concurrent, $290/yr if you need unlimited.',
              'Those aren\'t rhetorical numbers. They\'re from public pricing pages, verified April 2026.',
            ]}
          />
        </div>

        {/* Footer action */}
        <div className="mt-20 pt-10 border-t border-gray-200">
          <p className="text-2xl font-black tracking-tight mb-4 text-[#003D5C]">
            Ready when you are.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center bg-[#7FBC00] text-white px-6 py-4 text-base font-bold hover:bg-[#6DA300] transition-colors rounded-md"
            >
              Post a job free →
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center border border-gray-200 px-6 py-4 text-base font-bold hover:bg-[#003D5C] hover:text-white transition-colors rounded-md"
            >
              Browse Jobs
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Questions? Email{' '}
            <a
              href="mailto:info@avahealth.co"
              className="font-bold underline hover:text-[#003D5C]"
            >
              info@avahealth.co
            </a>
            .
          </p>
        </div>
      </div>

      {/* BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
              { '@type': 'ListItem', position: 2, name: 'Pricing', item: 'https://freejobpost.co/pricing' },
            ],
          }),
        }}
      />

</main>
  )
}

function Section({ q, a }: { q: string; a: string[] }) {
  return (
    <section>
      <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-4 text-[#003D5C]">{q}</h2>
      <div className="space-y-3">
        {a.map((para, i) => (
          <p key={i} className="text-gray-700 leading-relaxed">
            {para}
          </p>
        ))}
      </div>
    </section>
  )
}
