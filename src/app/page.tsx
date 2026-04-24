import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Free Job Post — Healthcare jobs without the Indeed tax',
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Beta launching April 2026.',
}

// Dummy previews for the "open roles" section — replaced with live data once
// the 424 seeded Ava jobs are exposed via the public_jobs view in Phase 1.
const PREVIEW_JOBS = [
  { title: 'Family Medicine Physician', facility: 'Lee Health', city: 'Fort Myers, FL', salary: '$270K+' },
  { title: 'ICU Registered Nurse', facility: 'Ochsner Health', city: 'New Orleans, LA', salary: '$95K–$125K' },
  { title: 'Licensed Clinical Social Worker', facility: 'HCA Florida', city: 'Tampa, FL', salary: '$72K–$88K' },
  { title: 'Hospitalist (Nocturnist)', facility: 'Tulane Medical Center', city: 'New Orleans, LA', salary: '$340K+' },
  { title: 'Physician Assistant — Urgent Care', facility: 'Banner Health', city: 'Phoenix, AZ', salary: '$120K–$145K' },
  { title: 'Registered Nurse — Labor & Delivery', facility: 'Sarasota Memorial', city: 'Sarasota, FL', salary: '$88K–$112K' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-xl tracking-tight">freejobpost<span className="text-green-700">.co</span></span>
            <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">BETA</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link href="/jobs" className="hover:text-green-700">Browse jobs</Link>
            <Link href="/how-it-works" className="hover:text-green-700">How it works</Link>
            <a href="https://freeresumepost.co" className="hover:text-green-700">For candidates</a>
            <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors">
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-32">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-8">
            <span className="w-2 h-2 bg-green-600" />
            FREE HEALTHCARE JOB BOARD
          </div>
          <h1 className="text-[64px] md:text-[104px] font-black leading-[0.92] tracking-tight mb-8">
            Free healthcare
            <br />
            job posts.
            <br />
            <span className="text-green-700">No Indeed tax.</span>
          </h1>
          <p className="text-xl md:text-2xl max-w-2xl leading-snug mb-10 text-gray-800">
            Post RN, MD, PT, and front-desk roles in 60 seconds. Real applicants.
            Zero auction fees. Built by a staffing team that got tired of paying to be seen.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center bg-black text-white px-6 py-4 text-base font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center border-2 border-black px-6 py-4 text-base font-bold hover:bg-black hover:text-white transition-colors"
            >
              Browse jobs
            </Link>
          </div>
          <p className="mt-8 text-sm text-gray-600">
            Hiring candidates? Send them to{' '}
            <a href="https://freeresumepost.co" className="font-bold underline hover:text-green-700">
              freeresumepost.co →
            </a>
          </p>
        </div>
      </section>

      {/* Three things */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-0 md:divide-x-2 md:divide-black">
          <div className="pr-0 md:pr-10 pb-10 md:pb-0 border-b-2 md:border-b-0 border-black">
            <div className="font-black text-6xl mb-4">01</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Free, forever</h2>
            <p className="text-gray-700 leading-relaxed">
              Post as many jobs as you want. No trial expiring. No per-applicant charges.
              No &ldquo;unlock this resume&rdquo; fees. If we ever charge, it&apos;s for optional boosts.
            </p>
          </div>
          <div className="px-0 md:px-10 pb-10 md:pb-0 border-b-2 md:border-b-0 border-black">
            <div className="font-black text-6xl mb-4">02</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Real applicants</h2>
            <p className="text-gray-700 leading-relaxed">
              Candidates upload their own resumes at freeresumepost.co. No scraped profiles,
              no bots, no bid-for-visibility games. If they apply, they&apos;re real people who chose you.
            </p>
          </div>
          <div className="pl-0 md:pl-10">
            <div className="font-black text-6xl mb-4">03</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Matches come to you</h2>
            <p className="text-gray-700 leading-relaxed">
              Our matching engine surfaces candidates that fit by specialty, state, experience,
              and credential. You get a real email when hot matches apply — no dashboard check needed.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">HOW IT WORKS</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight mb-16 max-w-3xl">
            Three steps. No credit card. No sales call.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: '01', h: 'Post', p: 'Fill the 60-second form: title, location, description, salary. Hit submit.' },
              { n: '02', h: 'Verify', p: 'We email you a one-click verification link. That\u2019s it — no account setup, no phone number.' },
              { n: '03', h: 'Get applicants', p: 'Real candidates see your post. They apply. You get emailed. Simple.' },
            ].map((step) => (
              <div key={step.n} className="bg-white border-2 border-black p-8">
                <div className="text-green-700 font-black text-xs tracking-widest mb-3">{step.n}</div>
                <h3 className="font-black text-2xl mb-3 tracking-tight">{step.h}</h3>
                <p className="text-gray-700 leading-relaxed">{step.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently posted */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">OPEN ROLES</h2>
              <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
                Fresh healthcare jobs.
              </p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center font-bold border-b-2 border-black hover:text-green-700 hover:border-green-700 pb-0.5"
            >
              View all →
            </Link>
          </div>
          <div className="divide-y-2 divide-black border-y-2 border-black">
            {PREVIEW_JOBS.map((job) => (
              <div
                key={job.title + job.facility}
                className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors cursor-pointer"
              >
                <div className="col-span-12 md:col-span-5 font-bold">{job.title}</div>
                <div className="col-span-6 md:col-span-3 text-gray-700">{job.facility}</div>
                <div className="col-span-6 md:col-span-2 text-gray-700 text-sm">{job.city}</div>
                <div className="col-span-12 md:col-span-2 font-bold text-right">{job.salary}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Big CTA */}
      <section className="border-b-2 border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <p className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-8">
            Ready to post
            <br />
            your first job?
          </p>
          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-10">
            Free forever. 60 seconds to post. No auction, no account setup, no sales call.
          </p>
          <Link
            href="/post-job"
            className="inline-flex items-center bg-green-600 text-black px-8 py-5 text-lg font-black hover:bg-green-500 transition-colors"
          >
            Post a job free →
          </Link>
        </div>
      </section>
    </main>
  )
}
