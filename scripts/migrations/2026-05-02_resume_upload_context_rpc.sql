-- Adds get_resume_upload_context_rpc — fetches a freshly-created candidate's
-- full profile + extracted resume text for the resume-uploaded-notify edge
-- function. Same SECURITY DEFINER + nonce-gate pattern as
-- consume_candidate_edit_rpc.
--
-- Why a new RPC instead of reusing consume_candidate_edit_rpc:
--   - consume_candidate_edit_rpc returns the candidate row + matches but
--     deliberately omits parsed_profile.raw_text (privacy: the candidate's
--     own UI doesn't need the raw text — they can see their parsed fields).
--   - For the upload notification email, Algy *does* want the raw text so
--     he can read the resume content without round-tripping to Supabase.
--   - Splitting the RPC keeps the principle that each function returns
--     exactly what its caller needs and no more.
--
-- The nonce-gate is the same edit token issued by submit_public_candidate_rpc.
-- That nonce expires in 7 days, so this RPC stops working for old candidates
-- — fine, because the only caller is the freeresumepost server action firing
-- right after upload (when the nonce is brand-new).

CREATE OR REPLACE FUNCTION public.get_resume_upload_context_rpc(
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
BEGIN
  IF p_candidate_id IS NULL OR p_nonce IS NULL OR length(p_nonce) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input', 'code', 400);
  END IF;

  -- Validate nonce — same lookup pattern as consume_candidate_edit_rpc
  SELECT * INTO v_token_row
  FROM public.marketplace_notifications
  WHERE type = 'candidate_edit_token'
    AND entity_type = 'public_candidates'
    AND entity_id = p_candidate_id
    AND (metadata->>'nonce') = p_nonce
  ORDER BY created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token', 'code', 401);
  END IF;
  IF (v_token_row.metadata->>'issued_at')::timestamptz < (now() - interval '7 days') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token expired', 'code', 410);
  END IF;

  SELECT * INTO v_candidate FROM public.public_candidates WHERE id = p_candidate_id;
  IF NOT FOUND OR v_candidate.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Candidate not found', 'code', 404);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'candidate', jsonb_build_object(
      'id', v_candidate.id,
      'slug', v_candidate.slug,
      'first_name', v_candidate.first_name,
      'last_name', v_candidate.last_name,
      'email', v_candidate.email,
      'phone', v_candidate.phone,
      'credential', v_candidate.credential,
      'specialty', v_candidate.specialty,
      'city', v_candidate.city,
      'state', v_candidate.state,
      'years_experience', v_candidate.years_experience,
      'remote_only', v_candidate.remote_only,
      'is_public', v_candidate.is_public,
      'source', v_candidate.source,
      'created_at', v_candidate.created_at
    ),
    'raw_text', COALESCE(v_candidate.parsed_profile->>'raw_text', ''),
    'extracted_at', v_candidate.parsed_profile->>'extracted_at',
    'code', 200
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_resume_upload_context_rpc(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_resume_upload_context_rpc(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_resume_upload_context_rpc IS
  'Returns a freshly-created candidate''s profile + parsed resume text for the resume-uploaded-notify edge function. Nonce-gated by the candidate edit token issued at submit time.';
