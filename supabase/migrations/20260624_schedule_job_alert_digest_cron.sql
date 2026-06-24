-- Schedule the job-alert-digest edge function (DB-as-code for an already-live cron).
--
-- The job-alert-digest function (deployed, verify_jwt=false) sends the staggered
-- weekly job-alert emails for freejobpost.co subscribers (public_job_alert_subscribers,
-- captured by the JobAlertCapture widget). It is the FULFILLMENT side of the
-- board->CRM lead capture: each subscriber gets new matching jobs on a rolling
-- 7-day cadence, capped at JOB_ALERT_DAILY_CAP/run, sent via Resend.
--
-- WHY THIS FILE: the cron was scheduled by hand (live as jobid 'job-alert-digest-daily',
-- active, '0 13 * * *') but the schedule was only ever a deploy-step comment in the
-- function source, not a committed migration. That means a fresh DB / branch restore
-- would NOT recreate it and the digests would silently stop. This file captures the
-- exact live schedule so the cron is reproducible. It is idempotent (unschedule then
-- reschedule by name) and the command is byte-identical to the live job, so applying
-- it on a DB that already has the cron is a no-op-equivalent.
--
-- AUTH: cron-only via X-Cron-Token = drip_scheduler_token (vault), same as the other
-- cron fns (adzuna-ingest, workday-backfill, run-drip-scheduler).
--
-- Schedule: daily at 13:00 UTC. The function itself only processes subscribers whose
-- last digest was >= 7 days ago, so a daily fire yields a per-subscriber weekly cadence.

DO $$
BEGIN
  PERFORM cron.unschedule('job-alert-digest-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not previously scheduled
END $$;

SELECT cron.schedule(
  'job-alert-digest-daily',
  '0 13 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/job-alert-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'drip_scheduler_token' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- Verify:
--   SELECT jobid, schedule, jobname, active FROM cron.job
--   WHERE jobname = 'job-alert-digest-daily';
--
-- Check recent runs:
--   SELECT jr.start_time, jr.status, jr.return_message
--   FROM cron.job_run_details jr
--   JOIN cron.job j ON j.jobid = jr.jobid
--   WHERE j.jobname = 'job-alert-digest-daily'
--   ORDER BY jr.start_time DESC LIMIT 6;
--
-- Disable temporarily:
--   UPDATE cron.job SET active = false WHERE jobname = 'job-alert-digest-daily';
--
-- Permanently remove:
--   SELECT cron.unschedule('job-alert-digest-daily');
