-- score_candidate_for_job calls similarity(text, text) from pg_trgm (installed
-- in the `extensions` schema), but the function's SET search_path declaration
-- only includes 'public' + 'pg_temp'. That makes similarity() invisible at
-- call time, so every invocation of refresh_marketplace_matches() (which
-- in turn calls score_candidate_for_job per (candidate, job) pair) raises
-- `function similarity(text, text) does not exist` and aborts.
--
-- The error is non-fatal in refresh-ats-imports (the matchRefresh wrapper
-- has a catch), but the entire match-refresh pipeline has been broken since
-- it was deployed: no candidate→job match scores get refreshed when the
-- 4h ATS cron ticks. Fix is a single ALTER FUNCTION adding `extensions` to
-- the search_path — no body change.
--
-- First successful run after this migration (2026-05-17): 75 inserts +
-- 529 updates in one tick.

ALTER FUNCTION public.score_candidate_for_job(public.public_candidates, public.public_jobs)
  SET search_path = public, extensions, pg_temp;
