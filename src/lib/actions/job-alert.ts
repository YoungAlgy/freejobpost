'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { track } from '@vercel/analytics/server'
import { addToMailchimpAudience } from '@/lib/mailchimp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type JobAlertInput = {
  email: string
  specialty: string | null
  state: string | null
  city: string | null
  source: string
}

export type JobAlertResult =
  | { success: true; already_subscribed?: boolean }
  | { success: false; error: string }

/**
 * Subscribe a visitor to job alerts → writes a re-contactable lead into the
 * shared Ava CRM via the `subscribe_job_alert_rpc` SECURITY DEFINER RPC
 * (RLS-locked table; anon can only insert through this RPC, never read).
 * Mirrors submitApplication / submitCandidate: Turnstile (fail-open when
 * unconfigured), server-side email validation, fire-and-forget conversion
 * event. PII never touches analytics.
 */
export async function subscribeJobAlert(
  input: JobAlertInput,
  turnstileToken?: string,
): Promise<JobAlertResult> {
  const hdrs = await headers()
  const remoteIp =
    hdrs.get('x-forwarded-for')?.split(',')[0].trim() || hdrs.get('x-real-ip') || null
  const turnstile = await verifyTurnstileToken(turnstileToken, remoteIp)
  if (!turnstile.ok) {
    return { success: false, error: turnstile.reason }
  }

  const email = (input.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  const { data, error } = await sb.rpc('subscribe_job_alert_rpc', {
    p_email: email,
    p_specialty: input.specialty?.trim() || null,
    p_state: input.state?.trim().toUpperCase() || null,
    p_city: input.city?.trim() || null,
    p_source: input.source?.trim() || null,
  })

  if (error) {
    console.error('subscribe_job_alert_rpc error:', error.message)
    return { success: false, error: 'Unable to subscribe right now. Please try again.' }
  }

  const r = (data ?? {}) as { success?: boolean; error?: string; already_subscribed?: boolean }
  if (r.success === false) {
    return { success: false, error: r.error || 'Unable to subscribe.' }
  }

  // Conversion event (board→CRM lead). Low-cardinality, PII-free, best-effort.
  try {
    await track('job_alert_subscribed', {
      source: input.source || 'unknown',
      specialty: input.specialty || 'any',
      state: input.state || 'any',
    })
  } catch {
    /* analytics is best-effort */
  }

  // Mailchimp audience add — downstream alert-send channel. ENV-GATED +
  // fail-soft: no-op until MAILCHIMP_API_KEY + MAILCHIMP_AUDIENCE_ID are set,
  // and never blocks the CRM capture (the CRM row is the source of truth).
  try {
    await addToMailchimpAudience(email, {
      specialty: input.specialty ?? '',
      state: input.state ?? '',
      city: input.city ?? '',
      source: input.source,
    })
  } catch {
    /* mailchimp is best-effort */
  }

  return { success: true, already_subscribed: r.already_subscribed }
}

/**
 * Honor an emailed unsubscribe link. The per-subscriber unsubscribe_token is
 * the capability (no auth needed); the RPC is idempotent.
 */
export async function unsubscribeJobAlert(token: string): Promise<{ success: boolean }> {
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return { success: false }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.rpc('unsubscribe_job_alert_rpc', { p_token: token })
  if (error) {
    console.error('unsubscribe_job_alert_rpc error:', error.message)
    return { success: false }
  }
  const payload = (data ?? {}) as { success?: boolean }
  return { success: payload.success === true }
}
