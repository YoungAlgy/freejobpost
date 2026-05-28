-- Bump the backfill-workday-descriptions cron throughput.
--
-- 2026-05-28: the original cron (20260526) ran every 4h at limit=50 =
-- 300 attempts/day. With 5,874 thin Workday jobs still outstanding (69%
-- of the Workday source) that's ~20 days to drain, and new thin jobs
-- keep arriving from the refresh-ats-imports listing-preview path.
--
-- Observed this session (2026-05-28):
--   - limit=50 single-board run: 48/50 updated, 2 × 403, 3.6s
--   - limit=200 all-tenant run:  163/200 updated, 37 × 403 (18.5%), 15.6s
--   The function is FAST (8-way parallel detail fetches), so the 150s edge
--   cap is not the constraint — Workday's per-IP throttle is. Error rate
--   climbs with request volume to a single tenant.
--
-- New cadence: every 2 hours at :47, limit=150.
--   12 ticks/day × 150 = 1,800 attempts/day
--   At the ~80% success rate observed under moderate load ≈ 1,440 real
--   recoveries/day → drains the 5,874 backlog in ~4 days, then keeps pace
--   with new arrivals.
--
-- Why 150 not 200: limit=200 tipped the error rate to 18.5%. 150 keeps
-- per-tenant request volume lower (≈12 tenants, so ~12 req/tenant/tick)
-- and the 2-hour gap lets each tenant's throttle window reset between
-- runs — the opposite of the back-to-back manual drains that escalated
-- to 80% errors on 2026-05-26.
--
-- Offset :47 unchanged — stays 30 min clear of refresh-ats-imports (:17)
-- and 10 min clear of adzuna-ingest (:37) so we never double-hit Workday
-- tenants in the same minute.
--
-- Idempotent: unschedules the prior copy first.

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-4h');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-2h');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'backfill-workday-descriptions-every-2h',
  '47 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/backfill-workday-descriptions',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 150, 'min_length', 300),
    timeout_milliseconds := 140000
  );
  $$
);

-- Verify:
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname = 'backfill-workday-descriptions-every-2h';
--
-- Watch drain progress:
--   SELECT count(*) FILTER (WHERE description IS NULL OR length(description) < 300) AS thin,
--          count(*) AS total
--   FROM public.public_jobs
--   WHERE status='active' AND deleted_at IS NULL AND source LIKE 'workday:%';
--
-- If Workday escalates throttling (watch fetch_errors in return_message):
--   UPDATE cron.job SET active=false WHERE jobname='backfill-workday-descriptions-every-2h';
--   -- or drop limit back to 100 and re-run this migration.
