-- Add X-Cron-Token header to the adzuna-ingest and backfill-workday-descriptions
-- pg_cron invocations.
--
-- WHY: 2026-08-14 audit found both edge functions were missing the X-Cron-Token
-- auth check that their sibling cron functions (refresh-ats-imports,
-- job-alert-digest) already had — they were deployed verify_jwt=false with NO
-- authorization at all. The functions themselves are being fixed in the same
-- change to require X-Cron-Token (see supabase/functions/adzuna-ingest/index.ts
-- and supabase/functions/backfill-workday-descriptions/index.ts).
--
-- That means the EXISTING cron.schedule calls for these two functions
-- (20260527_schedule_adzuna_ingest_cron.sql, 20260526_schedule_workday_backfill_cron.sql,
-- 20260528_workday_backfill_cron_throughput.sql) would start getting 403'd on
-- every tick once the auth check ships, because none of them send the header.
-- This migration re-schedules both jobs, byte-identical except for the added
-- X-Cron-Token header, using the same drip_scheduler_token vault secret and
-- header name as job-alert-digest (20260624_schedule_job_alert_digest_cron.sql).
--
-- Idempotent: unschedules the prior copy by name, then reschedules.
--
-- MUST be applied at or before the updated edge functions are deployed —
-- deploying the auth check first without this would silently stop both crons.

DO $$
BEGIN
  PERFORM cron.unschedule('adzuna-ingest-every-4h');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'adzuna-ingest-every-4h',
  '37 */4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/adzuna-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'drip_scheduler_token' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-4h');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'backfill-workday-descriptions-every-4h',
  '47 */4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/backfill-workday-descriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'drip_scheduler_token' LIMIT 1)
    ),
    body := jsonb_build_object('limit', 50, 'min_length', 300),
    timeout_milliseconds := 140000
  );
  $cron$
);

-- Verify:
--   SELECT jobid, schedule, jobname, active FROM cron.job
--   WHERE jobname IN ('adzuna-ingest-every-4h', 'backfill-workday-descriptions-every-4h');
--
-- Check recent runs (after next scheduled tick) return status_code 200, not 403:
--   SELECT jr.start_time, jr.status, jr.return_message
--   FROM cron.job_run_details jr
--   JOIN cron.job j ON j.jobid = jr.jobid
--   WHERE j.jobname IN ('adzuna-ingest-every-4h', 'backfill-workday-descriptions-every-4h')
--   ORDER BY jr.start_time DESC LIMIT 10;
