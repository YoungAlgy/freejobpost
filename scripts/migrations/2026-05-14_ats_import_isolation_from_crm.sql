-- ATS import isolation from CRM
-- Applied 2026-05-14 via Supabase MCP (migration name: ats_import_isolation_from_crm)
-- Project ref: tsruqbodyrmxqzhvxret
-- ============================================================================
-- Problem: refresh_marketplace_matches() inserts into marketplace_notifications
-- (a CRM-facing table — Ava recruiters see "hot match" alerts there) whenever a
-- public_jobs row scores >=70 against a candidate. If we start importing jobs
-- from external ATS boards (Greenhouse, Lever), those jobs would generate hot-
-- match alerts for jobs Ava recruiters can't broker — the apply URL points to
-- the external employer's site, not us. Pure noise for the recruiter team.
--
-- Fix: Add is_ats_import flag. ATS import writer sets it true on every row.
-- Skip ats_import rows in the hot-match notification insert. Candidates still
-- see them in public_matches (the candidate dashboard) — they're real openings,
-- and clicking through to oscar.com / jobs.lever.co is the correct UX for
-- aggregated supply.
-- ============================================================================

-- 1. Flag column on public_jobs. Index only the TRUE values (partial) since
--    ats-imported rows will be the minority for a while.
ALTER TABLE public.public_jobs
  ADD COLUMN IF NOT EXISTS is_ats_import boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_public_jobs_ats_import
  ON public.public_jobs (is_ats_import)
  WHERE is_ats_import = true;

-- 2. Rewrite refresh_marketplace_matches with the ATS-aware notification gate.
--    Behavior diff vs prior version: hot-match notification INSERT now joins
--    public_jobs and filters out ats-imported jobs. Candidate-facing public_matches
--    writes are UNCHANGED — ATS jobs still surface to candidates.
CREATE OR REPLACE FUNCTION public.refresh_marketplace_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_updated int := 0;
  v_hot int := 0;
  v_started_at timestamptz := now();
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'permission denied: refresh_marketplace_matches requires internal user'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE _new_matches ON COMMIT DROP AS
  SELECT
    c.id AS candidate_id,
    j.id AS job_id,
    (public.score_candidate_for_job(c, j) ->> 'score')::int AS score,
    public.score_candidate_for_job(c, j) -> 'reasons' AS reasons
  FROM public.public_candidates c
  CROSS JOIN public.public_jobs j
  WHERE c.deleted_at IS NULL
    AND c.status = 'active'
    AND j.deleted_at IS NULL
    AND j.status = 'active'
    AND j.expires_at > now();

  DELETE FROM _new_matches WHERE score < 40;

  -- Hot-transition detection now JOINs public_jobs and filters out ATS imports.
  -- The hot-match notification feed is for CRM recruiters; they shouldn't see
  -- alerts for jobs owned by external employers (Greenhouse/Lever-sourced).
  CREATE TEMP TABLE _hot_transitions ON COMMIT DROP AS
  SELECT n.candidate_id, n.job_id, n.score, n.reasons
  FROM _new_matches n
  LEFT JOIN public.public_matches m
    ON m.candidate_id = n.candidate_id AND m.job_id = n.job_id
  JOIN public.public_jobs j2 ON j2.id = n.job_id
  WHERE n.score >= 70
    AND (m.id IS NULL OR coalesce(m.score, 0) < 70)
    AND j2.is_ats_import = false;

  -- Candidate-facing matches: ALL matches go in (including ATS). Candidates
  -- get the full menu; clicking through to oscar.com or lever.co is fine.
  WITH upserted AS (
    INSERT INTO public.public_matches (candidate_id, job_id, score, reasons)
    SELECT candidate_id, job_id, score, reasons FROM _new_matches
    ON CONFLICT (candidate_id, job_id) DO UPDATE
      SET score = EXCLUDED.score,
          reasons = EXCLUDED.reasons
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO v_inserted, v_updated
  FROM upserted;

  INSERT INTO public.marketplace_notifications (
    type, priority, entity_type, entity_id, message, metadata
  )
  SELECT
    'hot_match',
    1,
    'public_matches',
    pm.id,
    format(
      'Hot match (%s%%): %s %s ↔ %s',
      ht.score,
      pc.first_name, pc.last_name,
      pj.title
    ),
    jsonb_build_object(
      'candidate_id', ht.candidate_id,
      'candidate_slug', pc.slug,
      'candidate_name', pc.first_name || ' ' || pc.last_name,
      'job_id', ht.job_id,
      'job_slug', pj.slug,
      'job_title', pj.title,
      'score', ht.score,
      'reasons', ht.reasons
    )
  FROM _hot_transitions ht
  JOIN public.public_matches pm ON pm.candidate_id = ht.candidate_id AND pm.job_id = ht.job_id
  JOIN public.public_candidates pc ON pc.id = ht.candidate_id
  JOIN public.public_jobs pj ON pj.id = ht.job_id;

  GET DIAGNOSTICS v_hot = ROW_COUNT;

  DELETE FROM public.public_matches pm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.public_jobs j
     WHERE j.id = pm.job_id AND j.deleted_at IS NULL
       AND j.status = 'active' AND j.expires_at > now()
  ) OR NOT EXISTS (
    SELECT 1 FROM public.public_candidates c
     WHERE c.id = pm.candidate_id AND c.deleted_at IS NULL
       AND c.status = 'active'
  );

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'updated', v_updated,
    'hot_match_notifications', v_hot,
    'duration_ms', extract(epoch FROM (now() - v_started_at)) * 1000
  );
END;
$$;
