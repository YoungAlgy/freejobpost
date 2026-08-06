-- ats_import_upsert_jobs: the server-side ingest function for ATS imports.
-- Applied 2026-05-14 via Supabase MCP (migration name: ats_import_upsert_function)
-- Project ref: tsruqbodyrmxqzhvxret
-- ============================================================================
-- The Node generator script in scripts/generate-ats-import-sql.mjs (or future
-- cron edge function) fetches Greenhouse/Lever boards, normalizes the jobs,
-- and calls this function with a JSONB array. We keep the upsert logic in the
-- DB so the same call path works from any client (MCP execute_sql, edge
-- functions, scheduled jobs).
--
-- Idempotency:
--   - Employer upserted by slug (existing unique index)
--   - Each job upserted by external_ref (existing partial unique index)
-- Calling with the same JSONB twice yields 0 net changes.

CREATE OR REPLACE FUNCTION public.ats_import_upsert_jobs(
  p_employer_slug text,
  p_company_name  text,
  p_company_url   text,
  p_provider      text,    -- 'greenhouse' | 'lever'
  p_board_slug    text,    -- the board token (e.g. 'oscar')
  p_jobs          jsonb    -- array of job objects
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      slug text, title text, description text, city text, state text,
      remote_hybrid text, employment_type text, salary_min int, salary_max int,
      apply_url text, source text, external_ref text
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
      i.apply_url, i.source, 'active', ARRAY[]::text[], true,
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
$$;

REVOKE ALL ON FUNCTION public.ats_import_upsert_jobs(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ats_import_upsert_jobs(text,text,text,text,text,jsonb) TO authenticated, service_role;
