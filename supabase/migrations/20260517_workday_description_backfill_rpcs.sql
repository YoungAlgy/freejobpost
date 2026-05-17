-- Two helper RPCs for the backfill-workday-descriptions edge function.
--
-- Why RPCs and not direct PostgREST access from the function?
-- The `service_role` role has zero grants on `public_jobs` (only postgres,
-- authenticated, and anon do). Rather than hand service_role broad grants
-- on a shared production table, we route the backfill through SECURITY
-- DEFINER RPCs that run as `postgres` (the table owner). This matches the
-- existing `ats_import_upsert_jobs` pattern used by refresh-ats-imports.
--
-- Both RPCs operate ONLY on rows whose source begins with 'workday:' so
-- there's no exposure of non-Workday data. apply_workday_description_backfill
-- additionally guards each UPDATE with a length-comparison so a malformed
-- caller cannot regress a row to a shorter description.

CREATE OR REPLACE FUNCTION public.get_workday_backfill_candidates(
  p_limit int DEFAULT 50,
  p_min_length int DEFAULT 300,
  p_board text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source text,
  apply_url text,
  description text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    j.id,
    j.source,
    j.apply_url,
    COALESCE(j.description, '')
  FROM public.public_jobs j
  WHERE j.source LIKE 'workday:%'
    AND (p_board IS NULL OR j.source = p_board)
    AND j.status = 'active'
    AND j.deleted_at IS NULL
    AND COALESCE(LENGTH(j.description), 0) < p_min_length
  ORDER BY j.id ASC
  LIMIT GREATEST(LEAST(p_limit, 200), 1);
$$;

REVOKE EXECUTE ON FUNCTION public.get_workday_backfill_candidates(int, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workday_backfill_candidates(int, int, text) TO service_role;

-- Bulk-apply description updates from a jsonb array of {id, description}.
-- Returns the count of rows actually updated. Each UPDATE is guarded so
-- it only runs when the new description is strictly longer than the
-- current one (defense in depth — the edge function already checks this
-- but a buggy caller shouldn't be able to clobber good descriptions).
-- The WHERE source LIKE 'workday:%' clause scopes writes to the Workday
-- subset, so this RPC can never touch other providers' rows.
CREATE OR REPLACE FUNCTION public.apply_workday_description_backfill(
  p_updates jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
  total int := 0;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT (elem ->> 'id')::uuid AS id, elem ->> 'description' AS description
    FROM jsonb_array_elements(p_updates) AS elem
    WHERE (elem ->> 'id') IS NOT NULL
      AND (elem ->> 'description') IS NOT NULL
      AND length(elem ->> 'description') > 0
  LOOP
    UPDATE public.public_jobs
       SET description = rec.description,
           updated_at = now()
     WHERE id = rec.id
       AND source LIKE 'workday:%'
       AND status = 'active'
       AND deleted_at IS NULL
       AND length(rec.description) > COALESCE(length(description), 0);
    IF FOUND THEN
      total := total + 1;
    END IF;
  END LOOP;

  RETURN total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_workday_description_backfill(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_workday_description_backfill(jsonb) TO service_role;

COMMENT ON FUNCTION public.get_workday_backfill_candidates(int, int, text)
  IS 'Workday backfill helper: returns up to p_limit rows from public_jobs (Workday source only) whose description is shorter than p_min_length. SECURITY DEFINER so service_role can run it.';
COMMENT ON FUNCTION public.apply_workday_description_backfill(jsonb)
  IS 'Workday backfill helper: bulk-applies {id, description} updates from a jsonb array. Scoped to Workday source. SECURITY DEFINER + length guard to prevent regressions.';
