'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { verifyTurnstileToken } from '@/lib/turnstile'
import { validatePayTransparency, validateSalaryRangeSanity } from '@/lib/pay-transparency'
import { validateSpecialtyScope } from '@/lib/specialty-scope'
import { track } from '@/lib/track'
import { FREEJOBPOST_SUPPORT_EMAIL } from '@/lib/freejobpost-email'
import { safeApplyUrl } from '@/lib/safe-apply-url'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type PostJobInput = {
  contact_email: string
  contact_name: string
  company_name: string
  company_url: string
  title: string
  description: string
  role: string
  specialty: string
  city: string
  state: string
  remote_hybrid: 'remote' | 'hybrid' | 'onsite'
  employment_type: 'full_time' | 'part_time' | 'contract' | 'locum' | 'per_diem' | 'internship'
  salary_min: number | null
  salary_max: number | null
  experience_required: string
  apply_url: string
}

export type PostJobResult =
  | { success: true; job_slug: string; already_submitted?: boolean; verify_email_sent?: boolean }
  | { success: false; error: string }

const SAFE_SUBMISSION_ERRORS = [
  /^Invalid email$/,
  /^Company name must be 1-200 chars$/,
  /^Title must be 3-200 chars$/,
  /^Description must be 30-10000 chars$/,
  /^Invalid remote\/hybrid value$/,
  /^Invalid employment type$/,
  /^State must be a 2-letter code$/,
  /^Salary out of range$/,
  /^Contact name too long \(max 200\)$/,
  /^Company URL too long \(max 500\)$/,
  /^Role too long \(max 200\)$/,
  /^Specialty too long \(max 200\)$/,
  /^City too long \(max 200\)$/,
  /^Experience field too long \(max 2000\)$/,
  /^FreeJobPost accepts nursing and allied-health roles only\./,
  /^[A-Z]{2} requires (?:a posted salary range|a real salary range) \(/,
  /^Salary minimum can't be higher than the maximum\.$/,
  /^That's a lot of posts in a short window\. Try again in a few hours\.$/,
  /^You already have \d+ active job posts\./,
  /^External apply links must be valid HTTPS URLs without embedded credentials\.$/,
  /^Company websites must be valid HTTPS URLs without embedded credentials\.$/,
]

function safeSubmissionError(error: string | undefined): string {
  if (error && SAFE_SUBMISSION_ERRORS.some((pattern) => pattern.test(error))) return error
  return 'Unable to submit. Please check the form and try again.'
}

// Server action — receives the form data, submits via RPC, triggers verify email.
// Exposed via a useActionState client hook in /post-job/page.tsx.
export async function submitPostJob(
  _prev: PostJobResult | null,
  input: PostJobInput,
  turnstileToken?: string
): Promise<PostJobResult> {
  // Cloudflare Turnstile bot check — fail-open when not configured (see
  // src/lib/turnstile.ts), strict otherwise.
  const hdrs = await headers()
  const remoteIp = hdrs.get('x-forwarded-for')?.split(',')[0].trim() || hdrs.get('x-real-ip') || null
  const turnstile = await verifyTurnstileToken(turnstileToken, remoteIp)
  if (!turnstile.ok) {
    return { success: false, error: turnstile.reason }
  }

  // Basic sanitation + normalization; the RPC enforces the hard bounds
  const normalized: PostJobInput = {
    ...input,
    contact_email: (input.contact_email ?? '').trim().toLowerCase(),
    company_name: (input.company_name ?? '').trim(),
    contact_name: (input.contact_name ?? '').trim(),
    company_url: (input.company_url ?? '').trim(),
    title: (input.title ?? '').trim(),
    description: (input.description ?? '').trim(),
    role: (input.role ?? '').trim(),
    specialty: (input.specialty ?? '').trim(),
    city: (input.city ?? '').trim(),
    state: (input.state ?? '').trim().toUpperCase(),
    experience_required: (input.experience_required ?? '').trim(),
    apply_url: (input.apply_url ?? '').trim(),
  }

  if (normalized.apply_url) {
    const applyUrl = safeApplyUrl(normalized.apply_url, { requireHttps: true })
    if (!applyUrl) {
      return {
        success: false,
        error: 'External apply links must be valid HTTPS URLs without embedded credentials.',
      }
    }
    normalized.apply_url = applyUrl
  }

  if (normalized.company_url) {
    const companyUrl = safeApplyUrl(normalized.company_url, { requireHttps: true })
    if (!companyUrl) {
      return {
        success: false,
        error: 'Company websites must be valid HTTPS URLs without embedded credentials.',
      }
    }
    normalized.company_url = companyUrl
  }

  // Specialty-scope check — mirrors the client-side gate so a forged
  // FormData submit can't bypass it. See specialty-scope.ts for why this
  // exists and why it's deliberately conservative.
  const scopeErr = validateSpecialtyScope(normalized.title, normalized.role, normalized.specialty)
  if (scopeErr) {
    return { success: false, error: scopeErr }
  }

  // Pay-transparency check — reject postings in CA/CO/NY/WA/etc. that don't
  // include a salary range. Mirrors the client-side gate so a forged FormData
  // submit can't bypass it. Remote postings are exempt (candidate's state
  // controls; we don't know it yet at post-time).
  //
  // Separately, whenever both bounds ARE given, sanity-check them — this is
  // a data-integrity check, not a legal-disclosure requirement, so it runs
  // unconditionally (any state, remote or not) rather than being gated on
  // remote_hybrid like the check above.
  const payErr =
    normalized.remote_hybrid !== 'remote'
      ? validatePayTransparency(normalized.state, normalized.salary_min, normalized.salary_max)
      : null
  const sanityErr = validateSalaryRangeSanity(normalized.salary_min, normalized.salary_max)
  const err = payErr || sanityErr
  if (err) {
    return { success: false, error: err }
  }

  // Anon client — the RPC is SECURITY DEFINER with explicit validation
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  // Pre-flight operational cap. A scripted client can bypass the form, so the
  // server still enforces the account's current posting limit.
  //
  // The helper is added by `docs/quota-enforcement-migration.sql`. If it's
  // not yet applied (or if the helper errors for any reason), we silently
  // fall back to the existing UI-only enforcement — same as pre-migration
  // behavior. After migration lands, this gate is real.
  try {
    const { data: q, error: qErr } = await sb.rpc('check_employer_quota', {
      p_contact_email: normalized.contact_email,
    })
    if (!qErr && q) {
      const quota = q as {
        over_quota: boolean
        active_count: number | null
        quota: number | null
        error?: string
      }
      // The helper returns over_quota=true with null counts in two different
      // cases, so check the reason before reading the numbers:
      //  - error='rate_limited' means too many quota calls for this email in
      //    a minute. Block it, otherwise the rate limiter does nothing.
      //  - Accounts with a custom operational limit return null counts. Allow.
      if (quota.error === 'rate_limited') {
        return {
          success: false,
          error: 'Too many posts from this email in a row. Wait a minute and try again.',
        }
      }
      if (quota.over_quota && quota.active_count != null && quota.quota != null) {
        return {
          success: false,
          error: `You have ${quota.active_count} of ${quota.quota} active posts. Archive one before posting another, or email ${FREEJOBPOST_SUPPORT_EMAIL} for help.`,
        }
      }
    }
  } catch {
    // Helper RPC not yet deployed — fall back to UI-only enforcement.
  }

  // The held database rollout adds this standalone RPC first while leaving the
  // old Worker's two submission grants intact. Their retirement is a separate
  // post-cutover step, so this call never races a breaking grant change.
  const { data, error } = await sb.rpc('submit_freejobpost_job_rpc', {
    p_contact_email: normalized.contact_email,
    p_contact_name: normalized.contact_name || null,
    p_company_name: normalized.company_name,
    p_company_url: normalized.company_url || null,
    p_title: normalized.title,
    p_description: normalized.description,
    p_role: normalized.role || null,
    p_specialty: normalized.specialty || null,
    p_city: normalized.city || null,
    p_state: normalized.state || null,
    p_remote_hybrid: normalized.remote_hybrid,
    p_employment_type: normalized.employment_type,
    p_salary_min: normalized.salary_min,
    p_salary_max: normalized.salary_max,
    p_experience_required: normalized.experience_required || null,
    p_apply_url: normalized.apply_url || null,
  })

  if (error) {
    console.error('submitPostJob RPC error:', error.message)
    return { success: false, error: 'Unable to submit. Please try again.' }
  }

  const result = data as {
    success: boolean
    error?: string
    code: number
    employer_id?: string
    job_id?: string
    job_slug?: string
  }

  if (!result.success) {
    return { success: false, error: safeSubmissionError(result.error) }
  }

  if (!result.employer_id || !result.job_id || !result.job_slug) {
    console.error('submitPostJob RPC returned an incomplete success response')
    return { success: false, error: 'Unable to submit. Please try again.' }
  }

  // Verify email send. 2026-06 audit (F97): the outcome is now threaded to
  // the UI — the old version showed the same 'check your inbox' confirmation
  // even when the send failed, leaving the employer waiting on an email that
  // never existed.
  let verifyEmailSent = false
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/post-job-send-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        employer_id: result.employer_id,
        job_id: result.job_id,
        employer_email: normalized.contact_email,
        employer_name: normalized.contact_name,
        job_title: normalized.title,
      }),
    })
    if (!verifyRes.ok) {
      const txt = await verifyRes.text()
      console.error('post-job-send-verify failed:', verifyRes.status, txt.slice(0, 200))
    } else {
      verifyEmailSent = true
    }
  } catch (e) {
    console.error('post-job-send-verify fetch error:', e instanceof Error ? e.message : 'unknown')
  }

  // Conversion event (board→CRM): an employer posted a job (pending verify).
  // Low-cardinality, PII-free segments — no contact email/name/company.
  try {
    await track('post_job_submitted', {
      state: normalized.state || 'unknown',
      employment_type: normalized.employment_type,
      remote: normalized.remote_hybrid,
      has_external_apply: Boolean(normalized.apply_url),
    })
  } catch {
    /* analytics is best-effort */
  }

  return {
    success: true,
    job_slug: result.job_slug,
    verify_email_sent: verifyEmailSent,
  }
}
