import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How FreeJobPost works',
  description:
    'Post and apply to nursing and allied health jobs with a short, direct process.',
  alternates: { canonical: 'https://freejobpost.co/how-it-works' },
}

const EMPLOYER_STEPS = [
  ['Add the job', 'Enter the role, location, pay, description, and application method.'],
  ['Verify your work email', 'Open the private link we send. Your approved post then goes live.'],
  ['Manage the response', 'Review your jobs and applicants from the employer dashboard.'],
]

const JOB_SEEKER_STEPS = [
  ['Find a direct post', 'Browse current nursing and allied health roles posted by employers.'],
  ['Review the full job', 'See the employer, location, pay when supplied, and application method.'],
  ['Apply', 'Send your details to the employer. An account is not required.'],
]

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#276749]">
          How it works
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] text-[#17324D] sm:text-6xl">
          A shorter path from opening to applicant.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-600">
          FreeJobPost is focused on nursing and allied health. The product is kept simple for
          employers posting jobs and people applying to them.
        </p>

        <section className="mt-12" aria-labelledby="employers-heading">
          <h2 id="employers-heading" className="text-2xl font-black text-[#17324D]">
            For employers
          </h2>
          <ol className="mt-5 space-y-3">
            {EMPLOYER_STEPS.map(([title, copy], index) => (
              <li key={title} className="flex gap-4 rounded-xl border border-gray-200 p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDF4E8] text-sm font-black text-[#276749]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-black text-[#17324D]">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12" aria-labelledby="seekers-heading">
          <h2 id="seekers-heading" className="text-2xl font-black text-[#17324D]">
            For job seekers
          </h2>
          <ol className="mt-5 space-y-3">
            {JOB_SEEKER_STEPS.map(([title, copy], index) => (
              <li key={title} className="flex gap-4 rounded-xl border border-gray-200 p-5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8EEF4] text-sm font-black text-[#17324D]">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-black text-[#17324D]">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-12 rounded-2xl bg-[#17324D] p-6 text-white sm:p-8">
          <h2 className="text-2xl font-black">Ready to post?</h2>
          <p className="mt-2 text-sm leading-6 text-gray-200">
            The form takes a few minutes. No credit card is required.
          </p>
          <Link
            href="/post-job"
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#276749] px-6 py-3 font-bold text-white hover:bg-[#1F563B] sm:w-auto"
          >
            Post a job
          </Link>
        </div>
      </article>
    </main>
  )
}
