'use server'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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
  return { success: true }
}
