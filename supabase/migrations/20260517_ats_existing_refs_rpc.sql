-- Third SECURITY DEFINER RPC for the ATS-import edge function, completing
-- the workaround for service_role having zero grants on public_jobs (see
-- the earlier 2026-05-17 backfill migration for the broader story).
--
-- Used by refresh-ats-imports v14+: returns (slug, external_ref) for all
-- active rows of a single source. The edge function uses this to:
--   1. Skip the Workday detail-fetch for jobs it already has (avoids
--      hammering the per-tenant rate limit).
--   2. Detect cross-run slug collisions before they hit the upsert RPC's
--      unique-constraint error path.
--
-- Until today, the edge function used `.from('public_jobs').select(...)`
-- directly. That returned null on every cron tick due to the missing
-- grants — but the error was silently swallowed (the function didn't
-- destructure `.error`), so the optimization had been a no-op since v10.

CREATE OR REPLACE FUNCTION public.get_ats_existing_refs(p_source text)
RETURNS TABLE (slug text, external_ref text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT j.slug, j.external_ref
  FROM public.public_jobs j
  WHERE j.source = p_source
    AND j.external_ref IS NOT NULL
    AND j.status = 'active'
    AND j.deleted_at IS NULL
  -- Cap at 5000 to give CCF / AdventHealth / MGB headroom (each ~1,500
  -- active rows) while keeping the response payload bounded. Note: the
  -- PostgREST gateway will still apply its own default 1000-row cap when
  -- the function is invoked from supabase-js — see follow-up to convert
  -- to jsonb_agg() if we need to exceed that.
  LIMIT 5000;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ats_existing_refs(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ats_existing_refs(text) TO service_role;

COMMENT ON FUNCTION public.get_ats_existing_refs(text)
  IS 'ATS-import helper: returns (slug, external_ref) for active rows of one source. SECURITY DEFINER so service_role can run it (service_role has no direct grants on public_jobs). Used by refresh-ats-imports for dedup + cross-run slug-collision detection.';
