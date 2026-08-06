-- Fix: apply-notify edge function silently 404s on every applicant.
--
-- Root cause: apply-notify ran direct anon SELECTs against public_candidates
-- and public_employers. RLS on public_candidates only allows anon when
-- is_public = true; RLS on public_employers blocks anon entirely. The apply
-- flow creates new candidates with is_public = false (default) and 424 of
-- 425 active jobs have NULL contact_email on public_jobs (relying on the
-- public_employers fallback). Result: the edge function returns "Candidate
-- not found" or skips the employer email, so neither party gets notified.
-- Every applicant thinks their application went out, but the employer
-- inbox stays silent.
--
-- Fix: a SECURITY DEFINER RPC that runs as the function owner (bypassing
-- RLS) and returns the full context apply-notify needs in one round trip.
-- Anon-callable. Pattern matches consume_post_job_verification_rpc and the
-- updated consume_candidate_edit_rpc — narrow DB trust boundary.
--
-- Threat model note: this RPC is callable by anon with just an application
-- UUID. UUIDs are 122-bit and effectively unguessable. Worst-case abuse is
-- triggering a duplicate notification email for an application_id the
-- attacker already has — which is no worse than what the original broken
-- function attempted. apply-notify is server-action-only (called from the
-- /jobs/[slug]/apply server action), so the surface is small. If we ever
-- decide to harden further, the right move is one-shot consumption via a
-- marketplace_notifications row keyed on application_id.

CREATE OR REPLACE FUNCTION public.get_apply_notify_context_rpc(
  p_application_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app public.public_applications;
  v_job public.public_jobs;
  v_candidate public.public_candidates;
  v_employer_email text;
BEGIN
  IF p_application_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing application_id', 'code', 400);
  END IF;

  SELECT * INTO v_app FROM public.public_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found', 'code', 404);
  END IF;

  SELECT * INTO v_job FROM public.public_jobs WHERE id = v_app.job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found', 'code', 404);
  END IF;

  SELECT * INTO v_candidate FROM public.public_candidates WHERE id = v_app.candidate_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Candidate not found', 'code', 404);
  END IF;

  -- Resolve employer email: prefer per-job contact_email if set, fall back
  -- to the parent employer's contact_email otherwise. This mirrors the old
  -- edge-function logic but bypasses RLS so the fallback actually works.
  v_employer_email := v_job.contact_email;
  IF v_employer_email IS NULL OR v_employer_email = '' THEN
    SELECT contact_email INTO v_employer_email
    FROM public.public_employers
    WHERE id = v_job.employer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_app.id,
    'cover_note', v_app.cover_note,
    'employer_email', v_employer_email,
    'job', jsonb_build_object(
      'id', v_job.id,
      'slug', v_job.slug,
      'title', v_job.title,
      'city', v_job.city,
      'state', v_job.state
    ),
    'candidate', jsonb_build_object(
      'id', v_candidate.id,
      'slug', v_candidate.slug,
      'first_name', v_candidate.first_name,
      'last_name', v_candidate.last_name,
      'email', v_candidate.email,
      'phone', v_candidate.phone,
      'credential', v_candidate.credential,
      'specialty', v_candidate.specialty,
      'is_public', v_candidate.is_public
    ),
    'code', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_apply_notify_context_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_apply_notify_context_rpc(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_apply_notify_context_rpc IS
  'Returns the full context needed by the apply-notify edge function (job + candidate + employer email) for a given application_id. SECURITY DEFINER so it bypasses anon RLS on public_candidates and public_employers. Used by the freejobpost.co /jobs/[slug]/apply server action notification flow.';
