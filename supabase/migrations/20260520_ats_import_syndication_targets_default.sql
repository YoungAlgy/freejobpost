-- Two fixes for the syndication_targets-empty-array bug:
--
-- 1) ats_import_upsert_jobs RPC was inserting `ARRAY[]::text[]` for every
--    ATS-imported job, overriding the column default. This caused per-job
--    feeds, JobPosting JSON-LD on /jobs/[slug], and the partner-attributed
--    URLs in /jobs.xml to silently exclude every ATS row created after
--    the 2026-05-20 backfill ran. Audited count: 655 active jobs (6.8%)
--    invisible to Google Jobs + all per-partner feeds.
--
--    Fix: change the RPC to insert the volume-friendly set instead. Empty
--    means "no preference," not "opt out from everything"; the default
--    should reflect that.
--
-- 2) Backfill the 655 already-affected active rows to the same set.
--
-- The set chosen: talent, adzuna, jooble, glassdoor, careerjet, rss,
-- google — same as the 2026-05-20 backfill (commit 9402074), minus
-- careerjet originally + careerjet re-added today (commit 42d9c5e).
-- Excludes indeed/linkedin/ziprecruiter (strict partners we don't auto-
-- opt-in for republished content).

CREATE OR REPLACE FUNCTION public.ats_import_upsert_jobs(
  p_employer_slug text,
  p_company_name text,
  p_company_url text,
  p_provider text,
  p_board_slug text,
  p_jobs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employer_id uuid;
  v_inserted int := 0;
  v_updated  int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'permission denied: ats_import_upsert_jobs requires internal user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.public_employers (
    slug, company_name, company_url, contact_email,
    status, verified_via, verified_at, tier, verified_healthcare_org
  )
  VALUES (
    p_employer_slug,
    p_company_name,
    p_company_url,
    'noreply+ats-' || p_provider || '-' || p_board_slug || '@freejobpost.co',
    'active', 'ats_import', now(), 'free', true
  )
  ON CONFLICT (slug) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    company_url  = EXCLUDED.company_url,
    verified_via = 'ats_import',
    status       = 'active',
    updated_at   = now()
  RETURNING id INTO v_employer_id;

  WITH input AS (
    SELECT * FROM jsonb_to_recordset(p_jobs) AS x(
      slug             text,
      title            text,
      description      text,
      city             text,
      state            text,
      remote_hybrid    text,
      employment_type  text,
      salary_min       int,
      salary_max       int,
      apply_url        text,
      source           text,
      external_ref     text
    )
  ), up AS (
    INSERT INTO public.public_jobs (
      employer_id, slug, title, description, city, state, remote_hybrid,
      employment_type, salary_min, salary_max, apply_url, source, status,
      syndication_targets, is_ats_import, external_ref, expires_at
    )
    SELECT
      v_employer_id, i.slug, i.title, i.description, i.city, i.state,
      i.remote_hybrid, i.employment_type, i.salary_min, i.salary_max,
      i.apply_url, i.source, 'active',
      -- ATS-imported jobs default to the volume-friendly partner set, NOT
      -- the empty array. Empty arrays were silently breaking JobPosting
      -- JSON-LD + every per-partner feed (audited 2026-05-20).
      ARRAY['talent','adzuna','jooble','glassdoor','careerjet','rss','google']::text[],
      true,
      i.external_ref, now() + interval '60 days'
    FROM input i
    ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL DO UPDATE SET
      title           = EXCLUDED.title,
      description     = EXCLUDED.description,
      city            = EXCLUDED.city,
      state           = EXCLUDED.state,
      remote_hybrid   = EXCLUDED.remote_hybrid,
      employment_type = EXCLUDED.employment_type,
      salary_min      = EXCLUDED.salary_min,
      salary_max      = EXCLUDED.salary_max,
      apply_url       = EXCLUDED.apply_url,
      expires_at      = EXCLUDED.expires_at,
      status          = 'active',
      updated_at      = now()
      -- NOTE: deliberately NOT updating syndication_targets on conflict.
      -- If an existing row already has a non-empty array, we preserve the
      -- recruiter's choice. New rows get the default above.
    RETURNING (xmax = 0) AS was_insert
  )
  SELECT
    count(*) FILTER (WHERE was_insert),
    count(*) FILTER (WHERE NOT was_insert)
  INTO v_inserted, v_updated
  FROM up;

  RETURN jsonb_build_object(
    'employer_id', v_employer_id,
    'inserted',    v_inserted,
    'updated',     v_updated
  );
END;
$function$;

-- Backfill the 655 active rows that were created with empty arrays
-- between 2026-05-20 (initial backfill) and 2026-05-20 (this fix).
UPDATE public.public_jobs
   SET syndication_targets = ARRAY['talent','adzuna','jooble','glassdoor','careerjet','rss','google']::text[]
 WHERE status = 'active'
   AND deleted_at IS NULL
   AND expires_at > now()
   AND COALESCE(array_length(syndication_targets, 1), 0) = 0;

-- Careerjet catch-up backfill. Careerjet was added 2026-05-20 (commit
-- 42d9c5e) as a 4th paid-partner channel, AFTER the original 2026-05-13
-- volume-partner backfill ran. ~8,961 rows have the volume set but no
-- 'careerjet' entry, which makes /feeds/careerjet.xml serve only 655 of
-- 9,616 expected jobs. Append 'careerjet' to any row that already opted
-- into at least one volume-partner sibling AND doesn't have careerjet yet.
-- We use the volume-sibling test (rather than blanket-update everything)
-- so explicit opt-out arrays — e.g. `{indeed}` only — stay narrow.
UPDATE public.public_jobs
   SET syndication_targets = syndication_targets || ARRAY['careerjet']::text[]
 WHERE status = 'active'
   AND deleted_at IS NULL
   AND expires_at > now()
   AND NOT ('careerjet' = ANY(syndication_targets))
   AND (
        'talent' = ANY(syndication_targets)
     OR 'adzuna' = ANY(syndication_targets)
     OR 'jooble' = ANY(syndication_targets)
     OR 'glassdoor' = ANY(syndication_targets)
   );
