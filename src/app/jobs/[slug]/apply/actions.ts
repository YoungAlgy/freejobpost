'use server'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type ApplyInput = {
  job_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  cover_note: string
  resume_url: string
}

export type ApplyResult =
  | { success: true; job_slug: string; job_title: string; emails_sent: number }
  | { success: false; error: string }

export async function submitApplication(_prev: ApplyResult | null, input: ApplyInput): Promise<ApplyResult> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  const email = (input.email ?? '').trim().toLowerCase()
  const firstName = (input.first_name ?? '').trim()
  const lastName = (input.last_name ?? '').trim()

  const { data, error } = await sb.rpc('apply_to_job_rpc', {
    p_job_id: input.job_id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_phone: input.phone || null,
    p_cover_note: input.cover_note || null,
    p_resume_url: input.resume_url || null,
  })

  if (error) {
    console.error('apply_to_job_rpc error:', error.message)
    return { success: false, error: 'Unable to submit. Please try again.' }
  }

  const r = data as {
    success: boolean
    error?: string
    code: number
    application_id?: string
    candidate_id?: string
    job_slug?: string
    job_title?: string
  }
  if (!r.success) {
    return { success: false, error: r.error || 'Application rejected.' }
  }

  // Fire the notifications — don't block the confirmation screen on email
  // failure, but log so we know if something's wrong.
  let emailsSent = 0
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/apply-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        application_id: r.application_id,
        candidate_id: r.candidate_id,
        job_id: input.job_id,
        cover_note: input.cover_note,
      }),
    })
    if (res.ok) {
      const body = await res.json()
      emailsSent = body.emails_sent ?? 0
    } else {
      const txt = await res.text()
      console.error('apply-notify failed:', res.status, txt.slice(0, 200))
    }
  } catch (e) {
    console.error('apply-notify fetch error:', e instanceof Error ? e.message : 'unknown')
  }

  return {
    success: true,
    job_slug: r.job_slug!,
    job_title: r.job_title!,
    emails_sent: emailsSent,
  }
}
