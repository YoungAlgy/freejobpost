import type { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import PostJobForm from './post-job-form'

export const metadata: Metadata = {
  title: 'Post a healthcare job — free',
  description:
    'Post a healthcare job for free on freejobpost.co. No credit card, no auction fees, no paywall. Verify your email once and your job goes live instantly.',
  alternates: { canonical: 'https://freejobpost.co/post-job' },
}

// ISR — keeps the live count fresh without re-rendering on every request
export const revalidate = 300

export default async function PostJobPage() {
  // Live count = social proof for employers landing here cold
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
  const activeJobs = count ?? 0

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
            <a href="https://www.freeresumepost.co" className="hover:text-green-700">
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
          <span className="w-2 h-2 bg-green-600 animate-pulse" />
          POST A JOB — FREE, FOREVER
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-4">
          Post a healthcare job.
        </h1>
        <p className="text-lg text-gray-700 mb-8 max-w-2xl">
          Takes 90 seconds. We&apos;ll email you a one-click link to verify your address.
          Your job goes live the moment you click it. No account, no auction.
        </p>

        {/* Trust strip — three numbers that matter to employers */}
        <div className="grid grid-cols-3 gap-3 mb-10 max-w-2xl border-y-2 border-black py-4">
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-600 mb-1">Active listings</div>
            <div className="text-2xl font-black tabular-nums flex items-baseline gap-1.5">
              {activeJobs.toLocaleString()}
              {activeJobs > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-600 inline-block" aria-hidden="true" />}
            </div>
          </div>
          <div className="border-l-2 border-black pl-4">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-600 mb-1">Candidate network</div>
            <div className="text-2xl font-black tabular-nums">850K+</div>
          </div>
          <div className="border-l-2 border-black pl-4">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-600 mb-1">Auction fees</div>
            <div className="text-2xl font-black">$0</div>
          </div>
        </div>

        <PostJobForm />

        {/* After you post — sets expectations for what happens next */}
        <div className="mt-14 mb-10">
          <h2 className="text-xs font-bold tracking-wider text-gray-600 uppercase mb-4">After you post</h2>
          <ol className="space-y-4">
            <li className="flex gap-4">
              <div className="shrink-0 w-7 h-7 bg-black text-white text-xs font-black flex items-center justify-center">1</div>
              <div>
                <div className="font-bold">We email you a verification link</div>
                <div className="text-sm text-gray-700 mt-0.5">One click confirms it&apos;s really your address. No password, no account setup. The link expires in 48 hours.</div>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="shrink-0 w-7 h-7 bg-black text-white text-xs font-black flex items-center justify-center">2</div>
              <div>
                <div className="font-bold">Your job goes live instantly</div>
                <div className="text-sm text-gray-700 mt-0.5">No review queue, no editorial gating. The link clicks → the post is live on /jobs and syndicated to Indeed via our XML feed.</div>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="shrink-0 w-7 h-7 bg-black text-white text-xs font-black flex items-center justify-center">3</div>
              <div>
                <div className="font-bold">Candidates apply to you directly</div>
                <div className="text-sm text-gray-700 mt-0.5">Applicants land in your inbox. We don&apos;t intercept, gate, or upsell. Manage everything from your free dashboard at <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/employer</code>.</div>
              </div>
            </li>
          </ol>
        </div>

        {/* Differentiation — why employers choose us vs Indeed */}
        <div className="mt-14 mb-6 border-t-2 border-black pt-10">
          <h2 className="text-xs font-bold tracking-wider text-gray-600 uppercase mb-5">vs the other guys</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-black p-5">
              <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Indeed Sponsored</div>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>· $0.10–$5.00 per click bid</li>
                <li>· Posts buried below paid ads</li>
                <li>· Candidate emails sold to recruiters</li>
                <li>· $300+ for visibility on a single role</li>
              </ul>
            </div>
            <div className="border-2 border-green-700 bg-green-50 p-5">
              <div className="text-xs font-bold tracking-wider text-green-700 uppercase mb-2">freejobpost.co</div>
              <ul className="space-y-1.5 text-sm text-gray-800 font-medium">
                <li>· $0 — no fees, ever</li>
                <li>· Same indexing, no demotion</li>
                <li>· Candidate emails go to you only</li>
                <li>· Post unlimited roles for free</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-4">
            We syndicate to Google for Jobs + Indeed&apos;s organic feed via{' '}
            <a href="/jobs.xml" className="underline hover:text-green-700">our public XML feed</a>.
          </p>
        </div>
      </div>
    </main>
  )
}
