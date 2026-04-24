import type { Metadata } from 'next'
import Link from 'next/link'
import PostJobForm from './post-job-form'

export const metadata: Metadata = {
  title: 'Post a healthcare job — free',
  description:
    'Post a healthcare job for free on freejobpost.co. No credit card, no auction fees, no paywall. Verify your email once and your job goes live instantly.',
  alternates: { canonical: 'https://freejobpost.co/post-job' },
}

export default function PostJobPage() {
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
            <a href="https://freeresumepost.co" className="hover:text-green-700">
              For candidates
            </a>
            <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold border-b-2 border-black">
              Post a job
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 md:py-16">
        <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
          <span className="w-2 h-2 bg-green-600" />
          POST A JOB — FREE, FOREVER
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-4">
          Post a healthcare job.
        </h1>
        <p className="text-lg text-gray-700 mb-10 max-w-2xl">
          Takes 90 seconds. We&apos;ll email you a one-click link to verify your address.
          Your job goes live the moment you click it. No account, no auction.
        </p>

        <PostJobForm />
      </div>
    </main>
  )
}
