import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { absolute: 'Find or Post Nursing and Allied Health Jobs | FreeJobPost' },
  description:
    'Post nursing and allied health jobs for free, or browse current roles posted directly by employers.',
  alternates: {
    canonical: 'https://freejobpost.co',
    types: {
      'application/rss+xml': [
        { url: '/feeds/rss.xml', title: 'FreeJobPost nursing and allied health jobs' },
      ],
    },
  },
  openGraph: {
    siteName: 'FreeJobPost',
    locale: 'en_US',
    title: 'Find or Post Nursing and Allied Health Jobs | FreeJobPost',
    description:
      'Post or browse direct-employer nursing and allied health jobs for free.',
    url: 'https://freejobpost.co',
    type: 'website',
  },
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="border-b border-gray-200 bg-[#F6F8F7]">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#276749]">
              Nursing and allied health
            </p>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.08] tracking-[-0.04em] text-[#17324D] sm:text-6xl">
              Find your next healthcare job.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600">
              Browse nursing and allied health roles posted directly by employers.
              Applying is free. No account required.
            </p>
            <form action="/jobs" method="get" role="search" aria-label="Find healthcare jobs" className="mt-7">
              <label htmlFor="home-job-search" className="block text-sm font-semibold text-[#17324D]">
                Job title, role, or city
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="home-job-search"
                  name="q"
                  type="search"
                  maxLength={80}
                  placeholder="Search jobs"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#276749]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[#276749] px-6 py-3 font-bold text-white transition-colors hover:bg-[#1F563B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#276749]"
                >
                  Find jobs
                </button>
              </div>
            </form>
            <Link href="/jobs" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#276749] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#276749]">
              Browse all jobs
            </Link>
          </div>

          <aside aria-labelledby="employer-entry" className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#276749]">For employers</p>
            <h2 id="employer-entry" className="mt-3 text-2xl font-black tracking-tight text-[#17324D]">
              Hiring? Post your opening free.
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Add the role and how to apply, then verify your work email.
              No account setup or credit card.
            </p>
            <Link
              href="/post-job"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#17324D] px-5 py-3 font-bold text-white transition-colors hover:bg-[#10263B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17324D]"
            >
              Post a job
            </Link>
            <Link href="/employer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#17324D] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17324D]">
              Manage my jobs
            </Link>
          </aside>
        </div>
      </section>

      <section aria-labelledby="resume-tool" className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 py-12 sm:px-6 sm:py-16 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4338CA]">
              For job seekers
            </p>
            <h2 id="resume-tool" className="mt-2 text-3xl font-black tracking-tight text-[#17324D]">
              Keep your resume ready.
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-gray-600">
              FreeResumePost lets nurses and allied health professionals upload, review, and
              update a resume profile. It stays private unless you turn on a limited public link.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Your resume profile stays separate. Browsing jobs does not send your resume or apply for a job.
            </p>
          </div>
          <a
            href="https://www.freeresumepost.co"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#4338CA] px-5 py-3 font-bold text-[#4338CA] transition-colors hover:bg-[#EEF2FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4338CA] md:w-auto"
          >
            Create my resume profile
          </a>
        </div>
      </section>
    </main>
  )
}
