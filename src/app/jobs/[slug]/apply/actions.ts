'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { track } from '@vercel/analytics/server'

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

// Round-2 audit: resume_url was passed to the RPC unvalidated, and the
// employer notification renders it as a link. Accept only http(s) URLs of
// sane length; anything else degrades to null (the field is optional)
// rather than failing the application.
function sanitizeResumeUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 500) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // Reject userinfo URLs (https://docs.google.com@evil.tld/cv.pdf) — the
    // classic lookalike-host phishing shape; the employer email renders this
    // as a clickable link. Round-3 audit catch.
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

export async function submitApplication(
  _prev: ApplyResult | null,
  input: ApplyInput,
  turnstileToken?: string
): Promise<ApplyResult> {
  // Cloudflare Turnstile bot check — fail-open when not configured (see
  // src/lib/turnstile.ts), strict otherwise.
  const hdrs = await headers()
  const remoteIp = hdrs.get('x-forwarded-for')?.split(',')[0].trim() || hdrs.get('x-real-ip') || null
  const turnstile = await verifyTurnstileToken(turnstileToken, remoteIp)
  if (!turnstile.ok) {
    return { success: false, error: turnstile.reason }
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  const email = (input.email ?? '').trim().toLowerCase()
  const firstName = (input.first_name ?? '').trim()
  const lastName = (input.last_name ?? '').trim()

  // Server-side validation (mirrors client required fields; guards RPC + email send)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' }
  }
  if (!firstName) {
    return { success: false, error: 'First name is required.' }
  }
  if (!lastName) {
    return { success: false, error: 'Last name is required.' }
  }

  const { data, error } = await sb.rpc('apply_to_job_rpc', {
    p_job_id: input.job_id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_phone: input.phone || null,
    p_cover_note: input.cover_note || null,
    p_resume_url: sanitizeResumeUrl(input.resume_url),
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

  // Conversion event (board→CRM): a native application reached the CRM.
  // Low-cardinality, PII-free. Wrapped so analytics never breaks a submit.
  try {
    await track('apply_submitted', { apply_type: 'native' })
  } catch {
    /* analytics is best-effort */
  }

  return {
    success: true,
    job_slug: r.job_slug!,
    job_title: r.job_title!,
    emails_sent: emailsSent,
  }
}
