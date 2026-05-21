-- Add 'careerjet' to the v_known whitelist inside
-- set_pending_job_syndication_targets().
--
-- Pre-fix bug (caught 2026-05-21 audit Pass 9): the RPC's v_known list was
-- written before 'careerjet' was added to the SyndicationTargetId union
-- (commit 42d9c5e). v_known is the server-side allowlist that filters out
-- "unknown" syndication targets. With 'careerjet' missing from v_known, a
-- recruiter who explicitly checks the Careerjet box on /post-job has their
-- choice SILENTLY STRIPPED — the line `where t = any(v_known)` rejects
-- 'careerjet' as unknown.
--
-- Impact path:
--   1. Recruiter posts a job on /post-job, checks Careerjet (default on)
--   2. Server action calls set_pending_job_syndication_targets(
--        p_targets => ['talent','adzuna','jooble','glassdoor','careerjet','rss','google'])
--   3. RPC filters with `t = any(v_known)` — careerjet drops out silently
--   4. Job written with ['talent','adzuna','jooble','glassdoor','rss','google']
--   5. /feeds/careerjet.xml never picks it up
--
-- No exposure of past data — the column default + migration 20260520_*
-- backfilled all existing rows with careerjet. This affects only NEW
-- /post-job submissions made after the v_known regression was introduced.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.set_pending_job_syndication_targets(
  p_job_id  uuid,
  p_targets text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Keep in sync with SyndicationTargetId in src/lib/syndication-targets.ts.
  -- 10 entries: indeed, ziprecruiter, glassdoor, linkedin, google, adzuna,
  -- jooble, talent, careerjet, rss.
  v_known   text[] := ARRAY[
    'indeed','ziprecruiter','glassdoor','linkedin','google',
    'adzuna','jooble','talent','careerjet','rss'
  ];
  v_clean   text[];
  v_status  text;
BEGIN
  IF p_job_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_id required');
  END IF;

  -- Sanitize: only known tokens, deduped
  IF p_targets IS NOT NULL AND array_length(p_targets, 1) > 0 THEN
    SELECT array_agg(DISTINCT t) INTO v_clean
      FROM unnest(p_targets) AS t
     WHERE t = ANY(v_known);
  END IF;
  -- Empty/invalid choices = recruiter wants no syndication. We honor that.
  -- (See the code-side feed filters: empty array means "explicit opt-out"
  -- and the row stays out of every per-partner feed + the on-page
  -- JobPosting JSON-LD. Distinct from a NULL or unset column — those
  -- would mean "no preference set" and would inherit the column default.)
  IF v_clean IS NULL THEN v_clean := ARRAY[]::text[]; END IF;

  -- Only mutate while the job is still in pending_verify (= the verify-link
  -- window). This prevents post-hoc tampering once a job is live.
  SELECT status INTO v_status
    FROM public.public_jobs
   WHERE id = p_job_id
   FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'job not found');
  END IF;

  IF v_status <> 'pending_verify' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job already verified — targets are now locked');
  END IF;

  UPDATE public.public_jobs
     SET syndication_targets = v_clean,
         updated_at = now()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'syndication_targets', v_clean);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pending_job_syndication_targets(uuid, text[]) TO anon, authenticated;
