import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  locationLabel,
} from '@/lib/public-jobs'
import ApplyForm from './apply-form'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/

type Props = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `Apply — ${slug}`,
    robots: { index: false, follow: true },
    alternates: { canonical: `https://freejobpost.co/jobs/${slug}` },
  }
}

async function getJob(slug: string): Promise<PublicJob | null> {
  if (!SLUG_RE.test(slug)) return null
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS)
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (data as PublicJob | null) ?? null
}

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params
  const job = await getJob(slug)
  if (!job) notFound()

  if (job.apply_url) {
    redirect(job.apply_url)
  }

  const loc = locationLabel(job)

  return (
    <main className="min-h-screen bg-white text-black">
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
          <Link href="/jobs" className="text-sm font-medium hover:text-green-700">
            Browse jobs
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10 md:py-14">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-green-700">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-green-700">
            Jobs
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/jobs/${slug}`} className="hover:text-green-700">
            {job.title}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-black">Apply</span>
        </nav>

        <div className="border-2 border-black p-6 mb-8">
          <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">
            Applying to
          </p>
          <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight mb-2">
            {job.title}
          </h1>
          {loc && <p className="text-gray-600">{loc}</p>}
        </div>

        <ApplyForm jobId={job.id} jobSlug={job.slug} jobTitle={job.title} />

        <p className="mt-8 text-xs text-gray-500">
          By applying you are sharing your contact info with the employer.
          They will reach you by email. We never sell your data — see{' '}
          <Link href="/privacy" className="underline hover:text-green-700">
            privacy
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
