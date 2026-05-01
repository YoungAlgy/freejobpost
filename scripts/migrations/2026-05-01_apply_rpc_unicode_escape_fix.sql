-- Fix: apply_to_job_rpc returned error messages with literal "’" sequences
-- visible to users (e.g. "You’ve applied to a lot of roles today").
--
-- Root cause: PostgreSQL regular (single-quoted) string literals don't process
-- backslash escapes, so '’' is stored as the literal 6-char sequence
-- backslash-u-2019, not as the U+2019 RIGHT SINGLE QUOTATION MARK character.
-- When jsonb_build_object serializes that to the wire, JSON encoding adds a
-- second backslash, and the client sees "You’ve...".
--
-- The fix is to embed the actual ’ character in the function source. Two
-- error-message strings affected:
--   - Rate-limit error (>=20 applies in 24h)
--   - Duplicate-application error (UNIQUE violation on candidate_id+job_id)
--
-- CREATE OR REPLACE FUNCTION updates the body without dropping; existing
-- callers continue to work. Function signature, security, and grants unchanged.

CREATE OR REPLACE FUNCTION public.apply_to_job_rpc(
  p_job_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_cover_note text,
  p_resume_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.public_jobs;
  v_candidate_id uuid;
  v_application_id uuid;
  v_recent_applies int;
  v_email_lc text;
  v_employer_email text;
  v_slug_base text;
  v_suffix text;
  v_candidate_slug text;
BEGIN
  -- Validation
  IF p_job_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing job_id', 'code', 400);
  END IF;
  IF p_email IS NULL OR position('@' in p_email) = 0 OR length(p_email) > 254 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email', 'code', 400);
  END IF;
  IF p_first_name IS NULL OR length(trim(p_first_name)) < 1 OR length(p_first_name) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'First name must be 1-100 chars', 'code', 400);
  END IF;
  IF p_last_name IS NULL OR length(trim(p_last_name)) < 1 OR length(p_last_name) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Last name must be 1-100 chars', 'code', 400);
  END IF;
  IF p_phone IS NOT NULL AND length(p_phone) > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phone too long', 'code', 400);
  END IF;
  IF p_cover_note IS NOT NULL AND length(p_cover_note) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cover note must be under 2000 chars', 'code', 400);
  END IF;
  IF p_resume_url IS NOT NULL AND p_resume_url <> '' AND p_resume_url !~ '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resume URL must be http(s)://', 'code', 400);
  END IF;

  v_email_lc := lower(p_email);

  -- Rate limit: 20 applies per email per 24h
  SELECT count(*) INTO v_recent_applies
  FROM public.public_applications pa
  JOIN public.public_candidates pc ON pa.candidate_id = pc.id
  WHERE lower(pc.email) = v_email_lc
    AND pa.created_at >= (now() - interval '24 hours');
  IF v_recent_applies >= 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You’ve applied to a lot of roles today. Try again tomorrow.',
      'code', 429
    );
  END IF;

  -- Load job + validate active
  SELECT * INTO v_job
  FROM public.public_jobs
  WHERE id = p_job_id
    AND deleted_at IS NULL
    AND status = 'active'
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found or no longer accepting applications', 'code', 404);
  END IF;

  -- Fetch employer contact email so the Next.js server action can notify them
  SELECT lower(contact_email) INTO v_employer_email
  FROM public.public_employers
  WHERE id = v_job.employer_id;

  -- Upsert candidate
  SELECT id INTO v_candidate_id
  FROM public.public_candidates
  WHERE lower(email) = v_email_lc AND deleted_at IS NULL
  LIMIT 1;

  IF v_candidate_id IS NULL THEN
    -- Build slug for new candidate
    v_slug_base := public.slugify(trim(p_first_name) || ' ' || trim(p_last_name));
    IF v_slug_base IS NULL OR length(v_slug_base) = 0 THEN
      v_slug_base := 'candidate';
    END IF;
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    v_candidate_slug := v_slug_base || '-' || v_suffix;
    WHILE EXISTS (SELECT 1 FROM public.public_candidates WHERE slug = v_candidate_slug) LOOP
      v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
      v_candidate_slug := v_slug_base || '-' || v_suffix;
    END LOOP;

    INSERT INTO public.public_candidates (
      slug, first_name, last_name, email, phone,
      vertical, resume_url, source, status, is_public,
      contact_via_email, contact_via_sms
    ) VALUES (
      v_candidate_slug,
      trim(p_first_name),
      trim(p_last_name),
      v_email_lc,
      NULLIF(trim(coalesce(p_phone, '')), ''),
      'healthcare',
      NULLIF(trim(coalesce(p_resume_url, '')), ''),
      'job_apply',
      'active',
      false,
      true,
      false
    ) RETURNING id INTO v_candidate_id;
  END IF;

  -- Insert application (unique on candidate_id + job_id via the schema constraint)
  BEGIN
    INSERT INTO public.public_applications (
      candidate_id, job_id, resume_snapshot_url, cover_note, status
    ) VALUES (
      v_candidate_id, p_job_id, p_resume_url, p_cover_note, 'submitted'
    ) RETURNING id INTO v_application_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You’ve already applied to this role. The employer has your info.',
      'code', 409
    );
  END;

  -- Bump apply_count atomically
  UPDATE public.public_jobs
     SET apply_count = COALESCE(apply_count, 0) + 1
   WHERE id = p_job_id;

  -- Fire notification for Ava team marketplace inbox
  INSERT INTO public.marketplace_notifications (
    type, priority, entity_type, entity_id, message, metadata
  ) VALUES (
    'application',
    3,
    'public_applications',
    v_application_id,
    format('New application: %s %s → %s', trim(p_first_name), trim(p_last_name), v_job.title),
    jsonb_build_object(
      'job_id', p_job_id,
      'job_slug', v_job.slug,
      'job_title', v_job.title,
      'candidate_email', v_email_lc,
      'employer_id', v_job.employer_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'candidate_id', v_candidate_id,
    'employer_contact_email', v_employer_email,
    'job_title', v_job.title,
    'job_slug', v_job.slug,
    'code', 201
  );
END;
$$;

COMMENT ON FUNCTION public.apply_to_job_rpc IS
  'Public apply flow for freejobpost.co /jobs/[slug]/apply. Upserts candidate + inserts application + bumps apply_count + fires marketplace_notifications row. Rate-limited to 20 applies per email per 24h.';
