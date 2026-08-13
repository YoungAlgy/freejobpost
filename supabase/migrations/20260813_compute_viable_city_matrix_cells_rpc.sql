-- Same fix as compute_viable_matrix_cells (this same migration date), for
-- city-specialty-matrix.ts. This one is higher-stakes: per that file's own
-- 2026-08-12 comment, it's called from /jobs/[slug] — the app's highest-
-- traffic route — and mirrored specialty-state-matrix.ts's full-corpus JS
-- scan without ever getting the 2026-08-07 concurrency-cap fix applied to
-- its sibling. Moving the (city, specialty) grouping + pattern match into
-- SQL removes it from the same cache-reliability class of bug entirely.
--
-- SECURITY INVOKER (default): runs with the caller's own permissions,
-- matching how city-specialty-matrix.ts already reads public_jobs with the
-- anon key today.
CREATE OR REPLACE FUNCTION public.compute_viable_city_matrix_cells(
  cities jsonb,        -- [{ "slug": text, "state": text, "patterns": text[] }, ...]
  specialties jsonb,   -- [{ "slug": text, "patterns": text[] }, ...]
  min_jobs integer DEFAULT 5
)
RETURNS TABLE (city_slug text, specialty_slug text, job_count integer)
LANGUAGE sql
STABLE
AS $$
  WITH active_jobs AS (
    SELECT city, state, specialty, role, title
    FROM public.public_jobs
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND expires_at > now()
      AND city IS NOT NULL
  ),
  c AS (
    SELECT
      (x ->> 'slug') AS slug,
      (x ->> 'state') AS state,
      ARRAY(SELECT jsonb_array_elements_text(x -> 'patterns')) AS patterns
    FROM jsonb_array_elements(cities) x
  ),
  spec AS (
    SELECT
      (x ->> 'slug') AS slug,
      ARRAY(SELECT jsonb_array_elements_text(x -> 'patterns')) AS patterns
    FROM jsonb_array_elements(specialties) x
  ),
  matches AS (
    SELECT c.slug AS city_slug, spec.slug AS specialty_slug
    FROM active_jobs j
    JOIN c ON c.state = j.state
      AND EXISTS (
        SELECT 1 FROM unnest(c.patterns) p WHERE j.city ILIKE ('%' || p || '%')
      )
    JOIN spec ON EXISTS (
      SELECT 1 FROM unnest(spec.patterns) p
      WHERE j.specialty ILIKE ('%' || p || '%')
         OR j.role ILIKE ('%' || p || '%')
         OR j.title ILIKE ('%' || p || '%')
    )
  )
  SELECT city_slug, specialty_slug, COUNT(*)::integer AS job_count
  FROM matches
  GROUP BY city_slug, specialty_slug
  HAVING COUNT(*) >= min_jobs
  ORDER BY job_count DESC, city_slug, specialty_slug;
$$;

REVOKE ALL ON FUNCTION public.compute_viable_city_matrix_cells(jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_viable_city_matrix_cells(jsonb, jsonb, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.compute_viable_city_matrix_cells IS
  'Server-side replacement for the JS full-corpus city×specialty matrix scan in city-specialty-matrix.ts (2026-08-13 incident fix, sibling of compute_viable_matrix_cells). City/specialty definitions are passed as parameters — source of truth stays in the TS slug files, not duplicated in SQL.';
