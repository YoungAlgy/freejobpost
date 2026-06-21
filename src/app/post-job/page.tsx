import type { Metadata } from 'next'
import Link from 'next/link'
import { supabase, hourIso } from '@/lib/supabase'
import PostJobForm from './post-job-form'

export const metadata: Metadata = {
  title: 'Post a healthcare job, free',
  description:
    'Post a healthcare job for free on freejobpost.co. No credit card, no auction fees, no paywall. Verify your email once and your job goes live instantly.',
  alternates: { canonical: 'https://freejobpost.co/post-job' },
  openGraph: {
    title: 'Post a healthcare job, free',
    description:
      'Post healthcare jobs for free. No auction fees, no paywall, no credit card.',
    url: 'https://freejobpost.co/post-job',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Post a healthcare job, free',
    description:
      'Post healthcare jobs for free. No auction fees, no paywall, no credit card.',
    images: ['/opengraph-image'],
  },
}

// ISR — keeps the live count fresh. 2026-05-28: 300s → 3600s (1h) in the
// cost audit; this is a low-traffic marketing/form page, no need to regen
// every 5 min. See jobs/[slug] for rationale.
export const revalidate = 21600

export default async function PostJobPage() {
  // Live count = social proof for employers landing here cold
  const { count } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
  const activeJobs = count ?? 0

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-10 md:py-16">
        <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1 text-xs font-bold tracking-wider mb-6">
          <span className="w-2 h-2 bg-[#7FBC00] animate-pulse" />
          POST A JOB: FREE, FOREVER
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-4 text-[#003D5C]">
          Post a healthcare job.
        </h1>
        <p className="text-lg text-gray-700 mb-8 max-w-2xl">
          Takes 60 seconds. We&apos;ll email you a one-click link to verify your address.
          Your job goes live the moment you click it. No account, no auction.
        </p>

        {/* Trust strip — three numbers that matter to employers */}
        <div className="grid grid-cols-3 gap-3 mb-10 max-w-2xl border-y border-gray-200 py-4">
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-600 mb-1">Active listings</div>
            <div className="text-2xl font-black tabular-nums flex items-baseline gap-1.5">
              {activeJobs.toLocaleString()}
              {activeJobs > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#7FBC00] inline-block" aria-hidden="true" />}
            </div>
          </div>
          <div className="border-l border-gray-200 pl-4">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-600 mb-1">Provider network</div>
            {/* Conservative round-down of the live count (1,400,648 verified 2026-05-13
                via the NPPES bulk + cross-table dedupe). See ~/.claude/.../MEMORY.md
                feedback_850k_stat.md — the canonical marketing stat is "1.4M+". */}
            <div className="text-2xl font-black tabular-nums">1.4M+</div>
          </div>
          <div className="border-l border-gray-200 pl-4">
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
              <div className="shrink-0 w-7 h-7 bg-[#003D5C] text-white text-xs font-black flex items-center justify-center rounded-lg">1</div>
              <div>
                <div className="font-bold">We email you a verification link</div>
                <div className="text-sm text-gray-700 mt-0.5">One click confirms it&apos;s really your address. No password, no account setup. The link expires in 48 hours.</div>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="shrink-0 w-7 h-7 bg-[#003D5C] text-white text-xs font-black flex items-center justify-center rounded-lg">2</div>
              <div>
                <div className="font-bold">Your job goes live instantly</div>
                <div className="text-sm text-gray-700 mt-0.5">No review queue, no editorial gating. The link clicks → the post is live on /jobs, indexed by Google for Jobs via structured data, and pushed to aggregator feeds within a few hours.</div>
              </div>
            </li>
            <li className="flex gap-4">
              <div className="shrink-0 w-7 h-7 bg-[#003D5C] text-white text-xs font-black flex items-center justify-center rounded-lg">3</div>
              <div>
                <div className="font-bold">Candidates apply to you directly</div>
                <div className="text-sm text-gray-700 mt-0.5">Applicants land in your inbox. We don&apos;t intercept, gate, or upsell. Manage everything from your free dashboard at <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/employer</code>.</div>
              </div>
            </li>
          </ol>
        </div>

        {/* Differentiation — why employers choose us vs sponsored boards */}
        <div className="mt-14 mb-6 border-t border-gray-200 pt-10">
          <h2 className="text-xs font-bold tracking-wider text-gray-600 uppercase mb-5">vs the other guys</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Sponsored boards</div>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>· $0.10-$5.00 per click bid</li>
                <li>· Posts buried below paid ads</li>
                <li>· Candidate emails sold to recruiters</li>
                <li>· $300+ for visibility on a single role</li>
              </ul>
            </div>
            <div className="rounded-xl border border-[#7FBC00] bg-green-50 shadow-sm p-5">
              <div className="text-xs font-bold tracking-wider text-[#003D5C] uppercase mb-2">Ava Health</div>
              <ul className="space-y-1.5 text-sm text-gray-800 font-medium">
                <li>· $0, no fees, ever</li>
                <li>· Same indexing, no demotion</li>
                <li>· Candidate emails go to you only</li>
                <li>· 10 active posts free, no auction, no upgrade</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-4">
            We syndicate to Google for Jobs + Indeed&apos;s organic feed via{' '}
            <a href="/jobs.xml" className="underline hover:text-[#003D5C]">our public XML feed</a>.
          </p>
        </div>
      </div>
    </main>
  )
}
