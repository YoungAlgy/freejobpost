-- Schedule the backfill-workday-descriptions edge function on a gentle cadence.
--
-- Background:
--   The backfill-workday-descriptions edge function (deployed 2026-05-17,
--   verify_jwt=false, v4) walks public_jobs rows where source LIKE 'workday:%'
--   and length(description) < min_length, refetches the Workday detail JSON
--   for each candidate, and rewrites description from jobPostingInfo.jobDescription.
--   Internally it parallelizes 8 detail-fetches and caps at 200 jobs/invocation.
--   It uses its own SUPABASE_SERVICE_ROLE_KEY from edge-runtime env to call
--   the SECURITY DEFINER RPCs — no caller auth required.
--
--   The function was never scheduled. As of 2026-05-26 we have 3,292 active
--   Workday jobs sitting at the listing's ~150-char description preview
--   instead of the full jobDescription. Structurally JobPosting-JSON-LD
--   eligible, but Google for Jobs rejects them for thin content.
--
--   The manual-drain attempt earlier today recovered 133 jobs across 6
--   invocations before Workday started throttling our IP (error rate climbed
--   16% → 80% over 4 consecutive runs). A test fire right after stopping
--   the drain returned 403 on the one candidate, confirming the throttle
--   is still on at the tenant level.
--
-- Approach:
--   Fire backfill-workday-descriptions every 4 hours at :47 — 30 min offset
--   from the existing refresh-ats-imports cron at :17 so we don't double-hit
--   Workday tenants in the same minute. Single invocation per tick (no
--   runner-script loop) keeps the per-IP request rate low enough to stay
--   under each tenant's throttle.
--
-- Expected drain rate:
--   6 calls/day × 50 candidates × ~73% success (observed in earlier batch
--   before throttle) = ~219 recoveries/day. Drains the 3,292-job backlog
--   in ~15 days. Sustainable beyond that as new thin jobs accumulate from
--   the natural listing-preview path.
--
-- Idempotent: re-running this migration unschedules the prior copy first.

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-4h');
EXCEPTION WHEN OTHERS THEN
  -- not previously scheduled — that's fine
  NULL;
END $$;

SELECT cron.schedule(
  'backfill-workday-descriptions-every-4h',
  '47 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/backfill-workday-descriptions',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 50, 'min_length', 300),
    timeout_milliseconds := 140000  -- 140s — function self-caps at 150s internal idle
  );
  $$
);

-- Verify:
--   SELECT jobid, schedule, jobname, active FROM cron.job
--   WHERE jobname = 'backfill-workday-descriptions-every-4h';
--
-- Check recent runs (after first :47 firing):
--   SELECT jr.start_time, jr.status, jr.return_message
--   FROM cron.job_run_details jr
--   JOIN cron.job j ON j.jobid = jr.jobid
--   WHERE j.jobname = 'backfill-workday-descriptions-every-4h'
--   ORDER BY jr.start_time DESC LIMIT 6;
--
-- Disable temporarily (e.g. if Workday escalates throttle):
--   UPDATE cron.job SET active = false WHERE jobname = 'backfill-workday-descriptions-every-4h';
--
-- Permanently remove:
--   SELECT cron.unschedule('backfill-workday-descriptions-every-4h');
