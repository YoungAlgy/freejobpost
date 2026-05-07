'use server'

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { ALL_TARGET_IDS, type SyndicationTargetId } from '@/lib/syndication-targets'
import { verifyTurnstileToken } from '@/lib/turnstile'

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
  syndication_targets: SyndicationTargetId[]
}

export type PostJobResult =
  | { success: true; job_slug: string; already_submitted?: boolean }
  | { success: false; error: string }

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

  // Anon client — the RPC is SECURITY DEFINER with explicit validation
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await sb.rpc('submit_public_job_rpc', {
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
    return { success: false, error: result.error || 'Submission rejected.' }
  }

  // Set syndication targets on the freshly-created (pending_verify) job.
  // Filter to known IDs server-side as defense-in-depth — RPC also filters.
  // Empty array is allowed (= recruiter wants no syndication).
  const cleanTargets = (input.syndication_targets ?? []).filter((t) =>
    (ALL_TARGET_IDS as readonly string[]).includes(t)
  ) as SyndicationTargetId[]
  // Default-on if recruiter didn't explicitly set anything (e.g. older form caches)
  const targetsToWrite = input.syndication_targets === undefined ? ALL_TARGET_IDS : cleanTargets
  if (result.job_id) {
    const { error: targetErr } = await sb.rpc('set_pending_job_syndication_targets', {
      p_job_id: result.job_id,
      p_targets: targetsToWrite,
    })
    if (targetErr) {
      // Non-fatal — job is still created with the column default (all on).
      // Just log; we don't want a syndication-targets failure to nuke the verify flow.
      console.error('set_pending_job_syndication_targets failed:', targetErr.message)
    }
  }

  // Fire-and-block on the verify email — the user should see the same
  // confirmation regardless of whether email send succeeded (follow-up
  // UX can resend via a self-service flow later).
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
    }
  } catch (e) {
    console.error('post-job-send-verify fetch error:', e instanceof Error ? e.message : 'unknown')
  }

  return {
    success: true,
    job_slug: result.job_slug!,
  }
}
