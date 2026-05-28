-- backfill-workday-descriptions cron cadence — REVERTED to gentle baseline.
--
-- 2026-05-28 (attempt): bumped every-4h/limit-50 → every-2h/limit-150 to
-- drain the 5,874-job thin-description backlog faster (~4 days vs ~20).
--
-- 2026-05-28 (revert, same night): backed out. The bump tripped Workday's
-- per-IP throttle HARD. Observed escalation across the session's runs:
--   limit=50  single-board : 4%  errors
--   limit=200 all-tenant   : 18.5% errors
--   limit=150 cron tick    : 42% errors (fired 16 min after a manual run)
--   limit=50  diagnostic   : 100% errors (throttle fully engaged)
-- This matches the original 20260526 migration's warning ("error rate
-- climbed 16% → 80% over 4 consecutive runs"). Large bursts (150) +
-- short gaps (2h) keep the throttle warm; it never gets time to reset.
--
-- KEY INSIGHT that makes the revert correct, not a compromise: the thin
-- jobs are now noindex'd at the page level (jobs/[slug] hasUsableDescription
-- gate, commits 0cf7085 + 2b28165). So they're cleanly excluded from
-- Google's index while they wait — they do NOT hurt domain quality. There
-- is therefore NO urgency to drain fast. A slow, throttle-safe trickle is
-- exactly right: each rehydrated description just promotes one job from
-- noindex → indexable, on no deadline.
--
-- Final cadence: every 4h at :47, limit 50 (the proven-sustainable
-- baseline from 20260526). ~50 × 0.73 success × 6 ticks/day ≈ 219
-- recoveries/day. Drains the backlog over a few weeks with zero throttle
-- pressure. If a future session wants faster: prefer SMALLER bursts at
-- HIGHER frequency (e.g. limit=50 every 2h = 600/day in gentle bursts)
-- over large bursts — and NEVER stack manual runs on top of the cron,
-- which is what tripped the hard throttle this session.
--
-- Offset :47 unchanged — 30 min clear of refresh-ats-imports (:17), 10 min
-- clear of adzuna-ingest (:37). Idempotent: unschedules prior copies first.

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-2h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('backfill-workday-descriptions-every-4h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'backfill-workday-descriptions-every-4h',
  '47 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/backfill-workday-descriptions',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 50, 'min_length', 300),
    timeout_milliseconds := 140000
  );
  $$
);

-- Throttle status note: as of this migration the per-IP throttle is fully
-- engaged (100% 403) from the session's drain attempts. It resets after a
-- few hours of no activity. The first :47 tick after the quiet period
-- should return to ~73% success. Watch:
--   SELECT (content::jsonb->>'updated')::int AS updated,
--          (content::jsonb->>'fetch_errors')::int AS errors
--   FROM net._http_response WHERE created > now() - interval '5 hours'
--     AND content::text LIKE '%candidates%' ORDER BY id DESC;
