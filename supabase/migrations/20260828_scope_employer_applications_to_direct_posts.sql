-- Keep employer applications inside FreeJobPost's direct-employer boundary.
-- This replaces the dashboard read RPC and the public apply RPC. The dashboard
-- keeps its response shape plus an explicit scope marker. The apply RPC keeps
-- its signature and response shape while rejecting jobs from every other
-- source. Apply before or with the matching frontend changes.

CREATE OR REPLACE FUNCTION public.get_employer_applications_rpc(p_employer_id uuid, p_nonce text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token_row public.marketplace_notifications;
  v_total_count integer;
BEGIN
  IF p_employer_id IS NULL OR p_nonce IS NULL OR length(p_nonce) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input', 'code', 400);
  END IF;

  SELECT * INTO v_token_row
  FROM public.marketplace_notifications
  WHERE type = 'employer_login_token'
    AND entity_type = 'public_employers'
    AND entity_id = p_employer_id
    AND (metadata->>'nonce') = p_nonce
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session', 'code', 401);
  END IF;

  IF (v_token_row.metadata->>'issued_at')::timestamptz < (now() - interval '30 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired', 'code', 410);
  END IF;

  SELECT count(*) INTO v_total_count
  FROM public.public_applications pa
  JOIN public.public_jobs pj ON pj.id = pa.job_id
  WHERE pj.employer_id = p_employer_id
    AND pj.source = 'public_employer_post'
    AND pj.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'scope', 'public_employer_post',
    'total_count', v_total_count,
    'applications', COALESCE(
      (
        SELECT jsonb_agg(row_to_json(a) ORDER BY a.applied_at DESC)
        FROM (
          SELECT
            pa.id                    AS application_id,
            pa.job_id,
            pj.title                 AS job_title,
            pj.slug                  AS job_slug,
            pj.city                  AS job_city,
            pj.state                 AS job_state,
            pc.first_name,
            pc.last_name,
            pc.email,
            pc.phone,
            pc.credential,
            pc.specialty,
            pa.cover_note,
            pa.status,
            pa.created_at            AS applied_at,
            pa.employer_notified_at
          FROM public.public_applications pa
          JOIN public.public_jobs       pj ON pj.id = pa.job_id
          JOIN public.public_candidates pc ON pc.id = pa.candidate_id
          WHERE pj.employer_id = p_employer_id
            AND pj.source = 'public_employer_post'
            AND pj.deleted_at IS NULL
            AND pc.deleted_at IS NULL
          ORDER BY pa.created_at DESC
          LIMIT 50
        ) a
      ),
      '[]'::jsonb
    ),
    'code', 200
  );
END;
$function$;

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
AS $function$
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

  SELECT count(*) INTO v_recent_applies
  FROM public.public_applications pa
  JOIN public.public_candidates pc ON pa.candidate_id = pc.id
  JOIN public.public_jobs pj ON pj.id = pa.job_id
  WHERE lower(pc.email) = v_email_lc
    AND pj.source = 'public_employer_post'
    AND pa.created_at >= (now() - interval '24 hours');
  IF v_recent_applies >= 20 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You’ve applied to a lot of roles today. Try again tomorrow.',
      'code', 429
    );
  END IF;

  SELECT * INTO v_job
  FROM public.public_jobs
  WHERE id = p_job_id
    AND source = 'public_employer_post'
    AND deleted_at IS NULL
    AND status = 'active'
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found or no longer accepting applications', 'code', 404);
  END IF;

  SELECT lower(contact_email) INTO v_employer_email
  FROM public.public_employers
  WHERE id = v_job.employer_id;

  SELECT id INTO v_candidate_id
  FROM public.public_candidates
  WHERE lower(email) = v_email_lc AND deleted_at IS NULL
  LIMIT 1;

  IF v_candidate_id IS NULL THEN
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

  UPDATE public.public_jobs
     SET apply_count = COALESCE(apply_count, 0) + 1
   WHERE id = p_job_id
     AND source = 'public_employer_post';

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
$function$;

REVOKE ALL ON FUNCTION public.apply_to_job_rpc(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_to_job_rpc(uuid, text, text, text, text, text, text)
  TO anon;

COMMENT ON FUNCTION public.apply_to_job_rpc(uuid, text, text, text, text, text, text) IS
  'Public apply flow for FreeJobPost direct-employer jobs. Upserts the candidate, inserts the application, increments apply_count, and records a marketplace notification. Rate-limited to 20 direct-job applications per email per 24 hours.';
