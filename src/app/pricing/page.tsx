import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How posting works · freejobpost.co',
  description:
    'Healthcare orgs get 10 free job posts, forever. This page explains how that works, what happens if you need more slots, and why we built freejobpost.co as a utility rather than a SaaS.',
  alternates: { canonical: 'https://freejobpost.co/pricing' },
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav — no Pricing link in topbar anymore */}
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
            <a href="https://www.freeresumepost.co" className="hover:text-green-700">
              For candidates
            </a>
            <Link
              href="/post-job"
              className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
          How posting works
        </p>
        <h1 className="text-4xl md:text-6xl font-black leading-[0.95] tracking-tight mb-8">
          10 free posts. Forever.
          <br />
          Yes, really.
        </h1>
        <p className="text-lg md:text-xl text-gray-700 leading-relaxed mb-4 max-w-2xl">
          freejobpost.co is a healthcare hiring utility, not a SaaS. Verified
          healthcare orgs get 10 active job posts, 90 days each, with every
          feature unlocked. If you need more, we figure it out together.
          That&apos;s the whole thing.
        </p>
        <p className="text-sm text-gray-500 mb-16">
          Last updated: April 2026
        </p>

        {/* FAQ-style sections */}
        <div className="space-y-14">
          <Section
            q="What do I get for free?"
            a={[
              '10 active job posts at any given time.',
              '90-day post duration (longer than Indeed organic).',
              'Every feature: apply-tracking dashboard, CSV export, analytics, 1 featured boost per month.',
              'Auto-syndication to Google for Jobs + Indeed free feed + ZipRecruiter partner feed + LinkedIn Limited Listings — one XML feed, every aggregator.',
              'Your own permanent URL: freejobpost.co/jobs/<your-role-slug>.',
            ]}
          />

          <Section
            q="What does 'active' mean?"
            a={[
              'A post is active from the moment you verify your email until one of three things happens: it expires after 90 days, you archive it as filled, or you delete it.',
              'Archiving a filled role is a one-click action from your employer dashboard — it frees a slot instantly so you can post the next one.',
              'Most healthcare orgs cycle through way fewer than 10 at a time, so the cap rarely matters in practice.',
            ]}
          />

          <Section
            q="What if I need more than 10 slots?"
            a={[
              'Email ally@avahealth.co. We manually flip your account to uncapped. No credit card required during beta — we just need to know who we\u2019re working with.',
              'When paid checkout lands post-beta, the price is $29/month for unlimited posts and $299/month for full ATS integration + API + white-label. Grandfathered for anyone who signs up during beta.',
              'We built this to be cheaper than every alternative (~$29/mo vs Indeed\u2019s $3,000/mo typical for 10 sponsored roles), not to maximize revenue per customer. Our cost to serve you is a few pennies a month.',
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
            q="What\u2019s the catch?"
            a={[
              'No catch. This product exists because Indeed just eliminated free organic visibility on March 31, 2026, and healthcare orgs we work with were getting hit with $3K+/month bills to post 10 jobs. We thought that was absurd.',
              'We\u2019re sustained by the much larger Ava Health recruiting business — this board is top-of-funnel for that. Even if zero people ever upgrade, the platform pays for itself in candidate flow.',
              'Grandfathered pricing is our commitment: if you join at the current rate, that\u2019s your rate for as long as you have the account. No surprise increases.',
            ]}
          />

          <Section
            q="How does this compare to what we pay now?"
            a={[
              'For a 10-role healthcare org, typical annual spend on the incumbents is:',
              '• Health eCareers: $4,990/yr ($499/post × 10 rollover)',
              '• LinkedIn Recruiter Corporate: $14,000+ (1 seat + boosts)',
              '• Indeed sponsored: $36,000+ (typical CPC × 10 concurrent)',
              '• ZipRecruiter: $60,000+ (daily rate × 10 slots)',
              '• freejobpost.co: $0 at 10 concurrent, $290/yr if you need unlimited.',
              'Those aren\u2019t rhetorical numbers — they\u2019re from public pricing pages, verified April 2026.',
            ]}
          />
        </div>

        {/* Footer action */}
        <div className="mt-20 pt-10 border-t-2 border-black">
          <p className="text-2xl font-black tracking-tight mb-4">
            Ready when you are.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center bg-black text-white px-6 py-4 text-base font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center border-2 border-black px-6 py-4 text-base font-bold hover:bg-black hover:text-white transition-colors"
            >
              Browse jobs
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Questions? Email{' '}
            <a
              href="mailto:ally@avahealth.co"
              className="font-bold underline hover:text-green-700"
            >
              ally@avahealth.co
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}

function Section({ q, a }: { q: string; a: string[] }) {
  return (
    <section>
      <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-4">{q}</h2>
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
