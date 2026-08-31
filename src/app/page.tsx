import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { absolute: 'Post Nursing and Allied Health Jobs Free | FreeJobPost' },
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
    title: 'Post Nursing and Allied Health Jobs Free | FreeJobPost',
    description:
      'Post or browse direct-employer nursing and allied health jobs for free.',
    url: 'https://freejobpost.co',
    type: 'website',
  },
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <section className="border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-24">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-[#276749]">
            Nursing and allied health
          </p>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.94] tracking-[-0.04em] text-[#17324D] sm:text-7xl">
            Post a nursing or allied health job. Free.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
            Add the role, verify your work email, and receive applications directly.
            No account setup or credit card.
          </p>
          <Link
            href="/post-job"
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#276749] px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-[#1F563B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#276749] sm:w-auto"
          >
            Post a job
          </Link>
          <p className="mt-4 text-sm text-gray-600">
            For US employers hiring nurses, therapists, technicians, and other allied health professionals.
          </p>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="bg-[#F6F8F7]">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
          <h2 id="how-it-works" className="text-2xl font-black tracking-tight text-[#17324D]">
            Three quick steps
          </h2>
          <ol className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ['1', 'Add the job', 'Enter the role, location, pay, and how candidates should apply.'],
              ['2', 'Verify your email', 'Open the link we send to your work email.'],
              ['3', 'Manage applicants', 'Use your private employer dashboard to review the response.'],
            ].map(([number, title, copy]) => (
              <li key={number} className="rounded-2xl border border-gray-200 bg-white p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DDF4E8] text-sm font-black text-[#276749]">
                  {number}
                </span>
                <h3 className="mt-4 font-black text-[#17324D]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="resume-tool" className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 py-12 sm:px-6 sm:py-16 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4338CA]">
              For job seekers
            </p>
            <h2 id="resume-tool" className="mt-2 text-3xl font-black tracking-tight text-[#17324D]">
              Keep one healthcare resume profile ready.
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-gray-600">
              FreeResumePost lets nurses and allied health professionals upload, review, and
              update a resume profile. It stays private unless you turn on a limited public link.
            </p>
          </div>
          <a
            href="https://www.freeresumepost.co"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#4338CA] px-5 py-3 font-bold text-[#4338CA] transition-colors hover:bg-[#EEF2FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4338CA] md:w-auto"
          >
            Go to FreeResumePost
          </a>
        </div>
      </section>
    </main>
  )
}
