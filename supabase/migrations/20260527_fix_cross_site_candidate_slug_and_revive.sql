-- Fix two production bugs in cross_site_create_candidate_profile from the
-- 2026-05-27 morning ship. Found while testing end-to-end via SQL with a
-- real nurse (Amanda Wood). Both bugs were caught BEFORE the recruiter UI
-- saw production traffic, but they would have surfaced as 404s and 409s
-- the first time someone clicked Publish on a Mixed-Case name or hit
-- Unpublish→Republish.

-- BUG 1: slug builder ate uppercase characters
--
-- v1 of the slug builder was:
--   v_name_slug := lower(regexp_replace(
--     trim(p_first_name) || '-' || substr(trim(p_last_name), 1, 1),
--     '[^a-z0-9]+', '-', 'g'
--   ))
--
-- The regex_replace ran BEFORE lower(), so on input "Amanda-W" it stripped
-- 'A' and 'W' (not in [a-z0-9]) and produced "-manda-", which then went
-- through lower() unchanged. The freeresumepost.co /profile/[slug] route
-- validates with SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/ — slugs starting
-- with '-' are rejected → 404.
--
-- Fix: lower() FIRST, then regex, then trim leading/trailing hyphens.
-- Result: "Amanda-W" → "amanda-w" (not "-manda-").

-- BUG 2: soft-delete + re-publish 409'd on email/slug unique constraints
--
-- The v1 design used the partial unique index
--   UNIQUE (ava_candidate_ref, ava_candidate_type) WHERE deleted_at IS NULL
-- so re-publishing after a soft-delete would create a FRESH row. But
-- public_candidates also has non-partial UNIQUE constraints on (email)
-- and (slug) that DON'T filter by deleted_at, so the soft-deleted row's
-- email still blocked the new insert. Recruiters would hit "duplicate
-- key" errors on every Unpublish→Republish cycle.
--
-- Fix: change the partial unique index to filter only on
-- `ava_candidate_ref IS NOT NULL` (always enforce per cross-site key),
-- and update ON CONFLICT DO UPDATE to clear deleted_at + reset status,
-- turning unpublish + republish into a revive-in-place flow on a single
-- row. Audit history preserved (consent_freeresumepost_at refreshes on
-- the CRM side; updated_at reflects republish on this side).

-- Replace the partial unique index. The old one filtered on
-- `WHERE deleted_at IS NULL`, which let the re-publish path try to INSERT
-- a new row that then collided with `public_candidates_email_key`.
DROP INDEX IF EXISTS public.public_candidates_ava_ref_uniq;
CREATE UNIQUE INDEX public_candidates_ava_ref_uniq
  ON public.public_candidates (ava_candidate_ref, ava_candidate_type)
  WHERE ava_candidate_ref IS NOT NULL;

-- Rewrite the RPC with both fixes:
--   (a) slug builder: lower → regex → trim leading/trailing hyphens
--   (b) ON CONFLICT: revive soft-deleted rows (clear deleted_at, force status='active')
CREATE OR REPLACE FUNCTION public.cross_site_create_candidate_profile(
  p_ava_candidate_ref uuid,
  p_ava_candidate_type text,
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

  -- Lower FIRST so uppercase characters survive the [a-z0-9] regex pass.
  -- Then trim leading/trailing hyphens so the slug satisfies
  -- freeresumepost.co's /^[a-z0-9][a-z0-9-]{0,120}$/ at the profile route.
  v_name_slug := regexp_replace(
    lower(trim(p_first_name) || '-' || substr(trim(p_last_name), 1, 1)),
    '[^a-z0-9]+', '-', 'g'
  );
  v_name_slug := trim(both '-' from v_name_slug);
  IF v_name_slug = '' THEN
    v_name_slug := 'candidate';  -- defensive: shouldn't hit (we validate name above)
  END IF;
  v_slug := v_name_slug || '-' || substr(p_ava_candidate_ref::text, 1, 8);

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
  ON CONFLICT (ava_candidate_ref, ava_candidate_type) WHERE ava_candidate_ref IS NOT NULL
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
    -- Revive a soft-deleted row instead of trying to INSERT a fresh one.
    -- Closes the bug where unpublish + republish collided on the (email)
    -- and (slug) non-partial unique constraints.
    deleted_at = NULL,
    status = 'active',
    slug = EXCLUDED.slug,
    updated_at = now()
  RETURNING pc.id, pc.slug INTO v_id, v_slug;

  RETURN QUERY SELECT v_id, v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.cross_site_create_candidate_profile FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cross_site_create_candidate_profile TO service_role;
