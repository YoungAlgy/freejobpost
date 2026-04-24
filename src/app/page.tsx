import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Free Job Post — Healthcare jobs without the Indeed tax',
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Beta launching April 2026.',
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex items-center">
        <div className="max-w-4xl mx-auto px-4 py-20 md:py-32">
          <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Beta opening April 2026
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-gray-900">
            Free healthcare job posts.
            <br />
            <span className="text-green-700">No Indeed tax.</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl leading-relaxed">
            Post openings for nurses, physicians, and allied health professionals
            without credit-card auctions or per-applicant fees. Built by a working
            staffing team, free forever for employers.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center px-6 py-3 bg-green-700 text-white font-semibold rounded-md hover:bg-green-800 transition"
            >
              Post a job
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 font-semibold rounded-md border border-gray-300 hover:border-gray-400 transition"
            >
              Browse open jobs
            </Link>
          </div>

          <p className="mt-6 text-sm text-gray-500">
            Candidate? Head to{' '}
            <a
              href="https://freeresumepost.co"
              className="text-blue-600 font-medium hover:underline"
            >
              freeresumepost.co
            </a>{' '}
            to upload your resume.
          </p>
        </div>
      </section>

      {/* Three things */}
      <section className="border-t border-gray-200 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-16 grid md:grid-cols-3 gap-10">
          <div>
            <div className="text-sm font-bold text-green-700 mb-2">01</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Free, forever
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Post as many jobs as you want. No trial expiring, no per-applicant charges,
              no "unlock" fees. If we ever charge, it&apos;s for optional boosts.
            </p>
          </div>
          <div>
            <div className="text-sm font-bold text-green-700 mb-2">02</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Real applicants, not resume mills
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Candidates upload their own resumes at freeresumepost.co — no scraped data,
              no bots, no bid-for-visibility games. If they apply, they&apos;re real.
            </p>
          </div>
          <div>
            <div className="text-sm font-bold text-green-700 mb-2">03</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Matches come to you
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Our matching engine surfaces candidates that fit your opening by specialty,
              state, experience, and credential. You get emailed when hot matches apply.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
