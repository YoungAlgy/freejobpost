-- Schedule the adzuna-ingest edge function on a gentle cadence.
--
-- The adzuna-ingest function (deployed 2026-05-27, verify_jwt=false) pulls
-- US healthcare jobs from Adzuna's public search API (categories:
-- healthcare-nursing-jobs + social-care-jobs) and upserts them into
-- public_jobs via ats_import_upsert_jobs.
--
-- The function is a no-op when the adzuna_app_id / adzuna_app_key vault
-- secrets are missing, so it's safe to schedule this cron BEFORE
-- credentials are provisioned. The cron will just fire repeatedly and
-- the function will return ok=true skipped=true until secrets land.
--
-- Schedule: every 4 hours at :37 — 20 min after refresh-ats-imports at
-- :17 and 10 min before backfill-workday-descriptions at :47. Spreads
-- out the load on the Edge Function runtime + on PostgREST schema cache
-- (we saw schema-cache thrashing 2026-05-27 when multiple ingestion
-- functions ran back-to-back).
--
-- Rate budget: 6 ticks/day × 2 categories × 1 call each = 12 calls/day.
-- Adzuna free tier allows 1000 calls/day. Plenty of headroom.

DO $$
BEGIN
  PERFORM cron.unschedule('adzuna-ingest-every-4h');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not previously scheduled
END $$;

SELECT cron.schedule(
  'adzuna-ingest-every-4h',
  '37 */4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/adzuna-ingest',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Verify:
--   SELECT jobid, schedule, jobname, active FROM cron.job
--   WHERE jobname = 'adzuna-ingest-every-4h';
--
-- Check recent runs:
--   SELECT jr.start_time, jr.status, jr.return_message
--   FROM cron.job_run_details jr
--   JOIN cron.job j ON j.jobid = jr.jobid
--   WHERE j.jobname = 'adzuna-ingest-every-4h'
--   ORDER BY jr.start_time DESC LIMIT 6;
--
-- Disable temporarily:
--   UPDATE cron.job SET active = false WHERE jobname = 'adzuna-ingest-every-4h';
--
-- Permanently remove:
--   SELECT cron.unschedule('adzuna-ingest-every-4h');
