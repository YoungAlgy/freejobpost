-- get_employer_applications_rpc silently caps at the 50 most recent applications
-- (LIMIT 50, no way for the caller to know more exist). Add a total_count field
-- so the employer dashboard can tell the employer when older applicants are being
-- hidden, instead of implying the 50 returned rows are the complete list.
--
-- NOT applied live -- requires a coordinated frontend deploy (src/app/employer/page.tsx
-- and dashboard.tsx already updated in this commit to read total_count, with a
-- fallback to applications.length if the field is absent, so the old RPC keeps
-- working until this migration ships).

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
    AND pj.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
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
