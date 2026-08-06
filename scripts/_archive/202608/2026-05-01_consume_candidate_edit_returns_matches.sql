-- Extend consume_candidate_edit_rpc to also return the candidate's top matches.
--
-- Why: the freeresumepost.co marketing copy promises that uploaded candidates
-- can see their job matches ("matches surface on your dashboard"). The
-- matching engine has been generating matches in public_matches all along,
-- but RLS blocks anon reads on public_matches and there was no RPC to surface
-- them. Result: the only way to see your matches was to be an Ava internal
-- user. This adds a candidate-facing matches view.
--
-- Same nonce gate as the existing edit consume — anyone holding a valid edit
-- token for a candidate can read their matches alongside their profile. The
-- token already expires in 7 days so this doesn't widen the auth surface.
--
-- Returns top 10 matches by score DESC, joined to public_jobs for the
-- fields the UI needs to render a job card. Excludes expired/deleted/inactive
-- jobs so the UI never renders dead links.

CREATE OR REPLACE FUNCTION public.consume_candidate_edit_rpc(
  p_candidate_id uuid,
  p_nonce text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate public.public_candidates;
  v_token_row public.marketplace_notifications;
  v_matches jsonb;
BEGIN
  IF p_candidate_id IS NULL OR p_nonce IS NULL OR length(p_nonce) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input', 'code', 400);
  END IF;

  SELECT * INTO v_token_row
  FROM public.marketplace_notifications
  WHERE type = 'candidate_edit_token'
    AND entity_type = 'public_candidates'
    AND entity_id = p_candidate_id
    AND (metadata->>'nonce') = p_nonce
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired edit token', 'code', 401);
  END IF;

  -- Tokens expire after 7 days
  IF (v_token_row.metadata->>'issued_at')::timestamptz < (now() - interval '7 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Edit token expired', 'code', 410);
  END IF;

  SELECT * INTO v_candidate FROM public.public_candidates WHERE id = p_candidate_id;
  IF NOT FOUND OR v_candidate.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Candidate not found', 'code', 404);
  END IF;

  -- Top 10 matches, sorted by score DESC. Filter to currently-active jobs so
  -- the candidate UI never shows dead links.
  SELECT COALESCE(jsonb_agg(m), '[]'::jsonb) INTO v_matches
  FROM (
    SELECT jsonb_build_object(
      'job_id', pj.id,
      'job_slug', pj.slug,
      'job_title', pj.title,
      'job_city', pj.city,
      'job_state', pj.state,
      'job_specialty', pj.specialty,
      'job_remote_hybrid', pj.remote_hybrid,
      'job_employment_type', pj.employment_type,
      'salary_min', pj.salary_min,
      'salary_max', pj.salary_max,
      'score', pm.score,
      'reasons', pm.reasons
    ) AS m
    FROM public.public_matches pm
    JOIN public.public_jobs pj ON pj.id = pm.job_id
    WHERE pm.candidate_id = p_candidate_id
      AND pj.status = 'active'
      AND pj.deleted_at IS NULL
      AND pj.expires_at > now()
    ORDER BY pm.score DESC, pm.updated_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'candidate', to_jsonb(v_candidate),
    'matches', v_matches,
    'code', 200
  );
END;
$$;

COMMENT ON FUNCTION public.consume_candidate_edit_rpc IS
  'Validates a candidate edit nonce and returns the candidate row plus their top 10 active job matches. Used by /profile/[slug]?t=&id= on freeresumepost.co.';
