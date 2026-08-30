import type { Metadata } from 'next'

import PostJobForm from './post-job-form'

export const metadata: Metadata = {
  title: 'Post a nursing or allied health job free',
  description:
    'Post a nursing or allied health job free. Add the role, verify your work email, and manage applications directly.',
  alternates: { canonical: 'https://freejobpost.co/post-job' },
  openGraph: {
    title: 'Post a nursing or allied health job free',
    description: 'A short job posting form with no credit card required.',
    url: 'https://freejobpost.co/post-job',
    type: 'website',
    images: ['/opengraph-image'],
  },
}

export default function PostJobPage() {
  return (
    <main className="min-h-screen bg-[#F6F8F7] text-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#276749]">
            Nursing and allied health
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[#17324D] sm:text-5xl">
            Post a job
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
            Add the details once. We will send a verification link to your work email before the
            post goes live. No account setup or credit card.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-7">
          <PostJobForm />
        </section>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="font-black text-[#17324D]">What happens next</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
            <li><strong className="text-gray-900">1.</strong> Open the verification link we email you.</li>
            <li><strong className="text-gray-900">2.</strong> Your approved job appears in public search.</li>
            <li><strong className="text-gray-900">3.</strong> Manage the post and applicants from your employer dashboard.</li>
          </ol>
        </section>
      </div>
    </main>
  )
}
