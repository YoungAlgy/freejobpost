-- Replace the JS full-corpus-pull specialty×state matrix computation with a
-- server-side aggregate. specialty-state-matrix.ts pulls every active job
-- (~20K rows) into JS and cross-matches against every specialty's patterns
-- there — expensive on every cache miss, and per the 2026-08-13 incident
-- audit, the OpenNext R2/D1-backed unstable_cache wrapping it was being
-- missed on nearly every request in production (10,000+ re-executions in
-- 35 minutes), which was the direct cause of the shared DB's CPU/disk-IO
-- exhaustion that forced the same night's Supabase Pro upgrade. This
-- function does the same (specialty, state) grouping + ILIKE pattern match
-- entirely in SQL so a cache miss is cheap regardless of whether the
-- app-level cache is reliable — specialty/state hub definitions stay in
-- src/lib/{specialty,state}-slugs.ts as the single source of truth and are
-- passed in as parameters at call time, not duplicated here.
--
-- SECURITY INVOKER (default, no SECURITY DEFINER clause): runs with the
-- caller's own permissions. Matches how specialty-state-matrix.ts already
-- reads public_jobs today, with the anon key.
CREATE OR REPLACE FUNCTION public.compute_viable_matrix_cells(
  specialties jsonb,   -- [{ "slug": text, "patterns": text[] }, ...]
  states jsonb,        -- [{ "slug": text, "abbr": text }, ...]
  min_jobs integer DEFAULT 5
)
RETURNS TABLE (specialty_slug text, state_slug text, job_count integer)
LANGUAGE sql
STABLE
AS $$
  WITH active_jobs AS (
    SELECT state, specialty, role, title
    FROM public.public_jobs
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND expires_at > now()
  ),
  spec AS (
    SELECT
      (s ->> 'slug') AS slug,
      ARRAY(SELECT jsonb_array_elements_text(s -> 'patterns')) AS patterns
    FROM jsonb_array_elements(specialties) s
  ),
  st AS (
    SELECT (s ->> 'slug') AS slug, (s ->> 'abbr') AS abbr
    FROM jsonb_array_elements(states) s
  ),
  matches AS (
    SELECT spec.slug AS specialty_slug, st.slug AS state_slug
    FROM active_jobs j
    JOIN st ON st.abbr = j.state
    JOIN spec ON EXISTS (
      SELECT 1
      FROM unnest(spec.patterns) p
      WHERE j.specialty ILIKE ('%' || p || '%')
         OR j.role ILIKE ('%' || p || '%')
         OR j.title ILIKE ('%' || p || '%')
    )
  )
  SELECT specialty_slug, state_slug, COUNT(*)::integer AS job_count
  FROM matches
  GROUP BY specialty_slug, state_slug
  HAVING COUNT(*) >= min_jobs
  ORDER BY job_count DESC, specialty_slug, state_slug;
$$;

REVOKE ALL ON FUNCTION public.compute_viable_matrix_cells(jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_viable_matrix_cells(jsonb, jsonb, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.compute_viable_matrix_cells IS
  'Server-side replacement for the JS full-corpus specialty×state matrix scan in specialty-state-matrix.ts (2026-08-13 incident fix). Specialty/state definitions are passed as parameters — source of truth stays in the TS slug files, not duplicated in SQL.';
