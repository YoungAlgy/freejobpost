'use server'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { PUBLIC_EMPLOYER_JOB_SOURCE } from '@/lib/public-jobs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const COOKIE_NAME = 'employer_session'

export async function logout() {
  const store = await cookies()
  store.delete({ name: COOKIE_NAME, path: '/employer' })
  redirect('/employer/login')
}

export async function archiveJob(
  jobId: string,
  status: 'filled' | 'expired'
): Promise<{ success: boolean; error?: string }> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return { success: false, error: 'Not signed in.' }

  let decoded = ''
  try {
    decoded = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return { success: false, error: 'Bad session token.' }
  }
  const [employer_id, nonce] = decoded.split('|')
  if (!employer_id || !nonce) return { success: false, error: 'Bad session token.' }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  // Check the exact product boundary before invoking the legacy RPC. This also
  // derives the canonical slug server-side instead of trusting a client value.
  const { data: directJob, error: directJobError } = await sb
    .from('public_jobs')
    .select('slug')
    .eq('id', jobId)
    .eq('employer_id', employer_id)
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .is('deleted_at', null)
    .maybeSingle()
  if (directJobError || !directJob) {
    if (directJobError) console.error('archive direct-job check error:', directJobError.message)
    return { success: false, error: 'Job not found.' }
  }

  const { data, error } = await sb.rpc('archive_job_by_employer_rpc', {
    p_employer_id: employer_id,
    p_nonce: nonce,
    p_job_id: jobId,
    p_status: status,
  })
  if (error) {
    console.error('archive_job_by_employer_rpc error:', error.message)
    return { success: false, error: 'Unable to archive.' }
  }
  const r = data as { success: boolean; error?: string }
  if (!r.success) return { success: false, error: r.error }

  revalidatePath('/employer')
  // Also bust the public /jobs/[slug] ISR cache immediately. Without this,
  // a job just marked filled/expired keeps serving its stale ACTIVE render
  // (live Apply CTA + JobPosting JSON-LD telling Google the role is still
  // open) for up to the 24h ISR window — the /api/revalidate-expired cron
  // exists to close exactly this gap for the pipeline's own status flips,
  // but it only fires on a 4h schedule and (separately) only ever looked at
  // status='expired', never the 'filled' status this employer action
  // produces. Revalidate here so the fix is immediate, not just eventual.
  if (directJob.slug) revalidatePath(`/jobs/${directJob.slug}`)
  return { success: true }
}
