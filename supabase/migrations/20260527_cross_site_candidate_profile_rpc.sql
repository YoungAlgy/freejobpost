-- Cross-site candidate-profile creation RPC.
--
-- Called by the CRM (app.avahealth.co) when a recruiter publishes a
-- consenting open-to-work candidate's profile to freeresumepost.co. See
-- docs/CRM_FREE_BRIDGING_SPEC.md for the full design.
--
-- Behavior:
--   - Upserts a row in public_candidates keyed on (ava_candidate_ref, ava_candidate_type).
--   - Sets source = 'avahealth_crm_cross_site' so reconciliation worker
--     can find these rows for two-way sync.
--   - Always sets is_public = true (the act of publishing IS the consent).
--   - Email is required (we can't dedupe without it). Phone optional.
--   - Returns the new candidate row's id + slug.
--   - Idempotent on re-call: existing row gets refreshed (e.g. recruiter
--     updates the candidate's specialty in CRM and republishes).
--
-- Security:
--   - SECURITY DEFINER so the CRM service role can invoke without needing
--     direct write grants on public_candidates.
--   - Restricted to service_role only — anon/authenticated have no path
--     to call this (the EXECUTE grant is intentionally narrow).
--   - HMAC verification at the HTTP layer (CRM-side API handler) gates
--     who can reach this RPC. The DB layer doesn't re-verify HMAC; it
--     trusts that whoever has service_role JWT already passed that gate.

CREATE OR REPLACE FUNCTION public.cross_site_create_candidate_profile(
  p_ava_candidate_ref uuid,
  p_ava_candidate_type text,  -- 'physician' | 'nurse' | 'therapist'
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_credential text DEFAULT NULL,
  p_specialty text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_years_experience integer DEFAULT NULL,
  p_desired_salary_min integer DEFAULT NULL,
  p_desired_salary_max integer DEFAULT NULL,
  p_resume_url text DEFAULT NULL
)
RETURNS TABLE (id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_slug text;
  v_name_slug text;
BEGIN
  -- Validation
  IF p_ava_candidate_ref IS NULL THEN
    RAISE EXCEPTION 'p_ava_candidate_ref is required';
  END IF;
  IF p_ava_candidate_type NOT IN ('physician', 'nurse', 'therapist') THEN
    RAISE EXCEPTION 'p_ava_candidate_type must be physician, nurse, or therapist';
  END IF;
  IF coalesce(trim(p_email), '') = '' THEN
    RAISE EXCEPTION 'p_email is required';
  END IF;
  IF coalesce(trim(p_first_name), '') = '' OR coalesce(trim(p_last_name), '') = '' THEN
    RAISE EXCEPTION 'p_first_name and p_last_name are required';
  END IF;

  -- Build slug from first + last initial + 8-char ref prefix.
  -- Matches the existing self_upload slug convention (first-name + last-initial)
  -- so URL shape is consistent across sources.
  v_name_slug := lower(regexp_replace(
    trim(p_first_name) || '-' || substr(trim(p_last_name), 1, 1),
    '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := v_name_slug || '-' || substr(p_ava_candidate_ref::text, 1, 8);

  -- Upsert. ON CONFLICT on (ava_candidate_ref, ava_candidate_type) refreshes
  -- editable fields without touching id/slug/created_at — so URL stays
  -- stable across recruiter edits in CRM.
  INSERT INTO public.public_candidates AS pc (
    ava_candidate_ref, ava_candidate_type,
    first_name, last_name, email, phone,
    credential, specialty, city, state,
    years_experience, desired_salary_min, desired_salary_max,
    resume_url, slug, source,
    is_public, contact_via_email, vertical, status
  )
  VALUES (
    p_ava_candidate_ref, p_ava_candidate_type,
    p_first_name, p_last_name, p_email, p_phone,
    p_credential, p_specialty, p_city, p_state,
    p_years_experience, p_desired_salary_min, p_desired_salary_max,
    p_resume_url, v_slug, 'avahealth_crm_cross_site',
    true, true, 'healthcare', 'active'
  )
  ON CONFLICT (ava_candidate_ref, ava_candidate_type) WHERE deleted_at IS NULL
  DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, pc.phone),
    credential = COALESCE(EXCLUDED.credential, pc.credential),
    specialty = COALESCE(EXCLUDED.specialty, pc.specialty),
    city = COALESCE(EXCLUDED.city, pc.city),
    state = COALESCE(EXCLUDED.state, pc.state),
    years_experience = COALESCE(EXCLUDED.years_experience, pc.years_experience),
    desired_salary_min = COALESCE(EXCLUDED.desired_salary_min, pc.desired_salary_min),
    desired_salary_max = COALESCE(EXCLUDED.desired_salary_max, pc.desired_salary_max),
    resume_url = COALESCE(EXCLUDED.resume_url, pc.resume_url),
    is_public = true,
    updated_at = now()
  RETURNING pc.id, pc.slug INTO v_id, v_slug;

  RETURN QUERY SELECT v_id, v_slug;
END;
$$;

-- The unique index needed for the upsert ON CONFLICT clause. Partial on
-- deleted_at IS NULL so that re-publishing after a soft-delete creates a
-- fresh row instead of reviving the deleted one (CRM-side decisions about
-- re-consent need to be explicit, not implicit).
CREATE UNIQUE INDEX IF NOT EXISTS public_candidates_ava_ref_uniq
  ON public.public_candidates (ava_candidate_ref, ava_candidate_type)
  WHERE deleted_at IS NULL;

-- Lock down access. Only service_role can call this; the HTTP layer on the
-- CRM side authenticates the caller before forwarding to PostgREST.
REVOKE ALL ON FUNCTION public.cross_site_create_candidate_profile FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cross_site_create_candidate_profile TO service_role;

-- Reconciliation helper RPC: soft-delete a freeresumepost profile when
-- the CRM revokes consent. Called by the CRM-side cleanup worker.
CREATE OR REPLACE FUNCTION public.cross_site_revoke_candidate_profile(
  p_ava_candidate_ref uuid,
  p_ava_candidate_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.public_candidates
  SET deleted_at = now(),
      is_public = false
  WHERE ava_candidate_ref = p_ava_candidate_ref
    AND ava_candidate_type = p_ava_candidate_type
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cross_site_revoke_candidate_profile FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cross_site_revoke_candidate_profile TO service_role;
