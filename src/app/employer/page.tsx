import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Dashboard from './dashboard'
import { PUBLIC_EMPLOYER_JOB_SOURCE } from '@/lib/public-jobs'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const COOKIE_NAME = 'employer_session'

type Job = {
  id: string
  slug: string
  title: string
  role: string | null
  specialty: string | null
  city: string | null
  state: string | null
  remote_hybrid: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  status: string
  apply_count: number
  view_count: number
  created_at: string
  expires_at: string
  source: string | null
}

type Employer = {
  company_name: string
  contact_name: string | null
  verified_healthcare_org: boolean
}

export type Application = {
  application_id: string
  job_id: string
  job_title: string
  job_slug: string
  job_city: string | null
  job_state: string | null
  first_name: string
  last_name: string
  email: string
  phone: string | null
  credential: string | null
  specialty: string | null
  cover_note: string | null
  status: string
  applied_at: string
  employer_notified_at: string | null
}

async function loadSession(): Promise<{
  employer: Employer
  jobs: Job[]
  applications: Application[]
  /** Real total across all of the employer's applications (may exceed applications.length, which is capped at 50). */
  totalApplications: number
  /** Slug for the employer's public /employers/[slug] page. null pre-migration
   * or if the employer is seeded/unverified. */
  publicSlug: string | null
} | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  let decoded = ''
  try {
    decoded = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
  const [employer_id, nonce] = decoded.split('|')
  if (!employer_id || !nonce) return null

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.rpc('consume_employer_login_rpc', {
    p_employer_id: employer_id,
    p_nonce: nonce,
  })
  if (error) return null
  const r = data as { success: boolean; employer?: Employer; jobs?: Job[] }
  if (!r.success || !r.employer) return null

  const sessionJobs = r.jobs ?? []
  const sessionJobIds = sessionJobs.map((job) => job.id)
  const directJobScope = sessionJobIds.length > 0
    ? sb
        .from('public_jobs')
        .select('id')
        .in('id', sessionJobIds)
        .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    : Promise.resolve({ data: [] as Array<{ id: string }>, error: null })

  // These additive lookups run together. Errors degrade to an empty scoped
  // section while the authenticated dashboard itself remains available.
  const [appsResult, slugResult, jobScopeResult] = await Promise.allSettled([
    sb.rpc('get_employer_applications_rpc', {
      p_employer_id: employer_id,
      p_nonce: nonce,
    }),
    sb
      .from('public_employers_directory')
      .select('slug, verified_via')
      .eq('id', employer_id)
      .maybeSingle(),
    directJobScope,
  ])

  const appsData =
    appsResult.status === 'fulfilled' && appsResult.value.data
      ? (appsResult.value.data as {
          success: boolean
          applications?: Application[]
          total_count?: number
          scope?: string
        })
      : null

  // consume_employer_login_rpc predates the standalone product boundary and
  // can return other jobs owned by the same account. Fail closed unless each
  // row identifies itself as a direct FreeJobPost submission.
  const scopedJobIds = new Set<string>()
  if (jobScopeResult.status === 'fulfilled' && !jobScopeResult.value.error) {
    for (const row of (jobScopeResult.value.data ?? []) as Array<{ id: string }>) {
      scopedJobIds.add(row.id)
    }
  }
  // Newer login-RPC rows include source. Keep that exact marker as a fallback
  // for pending posts that a public read policy may intentionally hide.
  for (const job of sessionJobs) {
    if (job.source === PUBLIC_EMPLOYER_JOB_SOURCE) scopedJobIds.add(job.id)
  }
  const jobs = sessionJobs.filter((job) => scopedJobIds.has(job.id))
  const directJobIds = new Set(jobs.map((job) => job.id))
  const applications: Application[] = (appsData?.success ? appsData.applications ?? [] : [])
    .filter((application) => directJobIds.has(application.job_id))
  // The updated RPC declares its direct-post scope. Older broad deployments
  // are post-filtered above, so their total_count cannot be trusted.
  const totalApplications = appsData?.scope === PUBLIC_EMPLOYER_JOB_SOURCE
    ? (appsData.total_count ?? applications.length)
    : applications.length

  let publicSlug: string | null = null
  if (slugResult.status === 'fulfilled') {
    const row = slugResult.value.data as { slug: string | null; verified_via: string | null } | null
    // Don't link to a public employer page for seeded or ATS-imported employers
    // (the latter never reaches this code path in practice — they have no login —
    // but the filter is defensive against future changes).
    if (row?.slug && row.verified_via !== 'seeded' && row.verified_via !== 'ats_import') {
      publicSlug = row.slug
    }
  }

  return { employer: r.employer, jobs, applications, totalApplications, publicSlug }
}

export default async function EmployerDashboardPage() {
  const session = await loadSession()
  if (!session) redirect('/employer/login')

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <Dashboard
        employer={session.employer}
        jobs={session.jobs}
        applications={session.applications}
        totalApplications={session.totalApplications}
        publicSlug={session.publicSlug}
      />
    </main>
  )
}
