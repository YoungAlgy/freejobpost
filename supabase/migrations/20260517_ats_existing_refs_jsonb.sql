-- jsonb-returning variant of get_ats_existing_refs to bypass the PostgREST
-- default db_max_rows=1000 cap on TABLE-returning RPCs. CCF (1,420), MGB
-- (1,086), AdventHealth (1,391), USAJobs (2,361) all exceed 1k and were
-- silently losing refs in the v14 deploy (boardSummary.existingRefs=1000
-- instead of the true count).
--
-- Kept alongside the TABLE-returning version so we can flip back if the
-- jsonb-parse path has issues. Once v15+ is stable, the TABLE version can
-- be dropped in a follow-up migration.

CREATE OR REPLACE FUNCTION public.get_ats_existing_refs_jsonb(p_source text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('slug', j.slug, 'external_ref', j.external_ref)),
    '[]'::jsonb
  )
  FROM public.public_jobs j
  WHERE j.source = p_source
    AND j.external_ref IS NOT NULL
    AND j.status = 'active'
    AND j.deleted_at IS NULL
  -- 5000-row cap matches the TABLE version. PostgREST returns the whole
  -- jsonb scalar regardless of row count, so the gateway 1000-cap no
  -- longer bites us. At current inventory the largest source (USAJobs)
  -- is ~2,500 rows / ~500 KB of jsonb — still well within reasonable
  -- response sizes.
  LIMIT 5000;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ats_existing_refs_jsonb(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ats_existing_refs_jsonb(text) TO service_role;

COMMENT ON FUNCTION public.get_ats_existing_refs_jsonb(text)
  IS 'Like get_ats_existing_refs() but returns jsonb to bypass PostgREST''s default 1000-row cap on TABLE-returning RPCs. Used by refresh-ats-imports v15+.';
