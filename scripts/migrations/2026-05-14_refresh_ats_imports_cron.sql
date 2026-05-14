-- pg_cron schedule for refresh-ats-imports edge function
-- Applied 2026-05-14 via Supabase MCP
-- Project ref: tsruqbodyrmxqzhvxret
-- ============================================================================
-- Fires the refresh-ats-imports edge function every 4 hours. The function
-- pulls each board in supabase/functions/refresh-ats-imports/index.ts'
-- SEED_BOARDS, normalizes US + healthcare jobs, and upserts via
-- ats_import_upsert_jobs(). Returns a JSON summary including inserts,
-- updates, and per-board errors.
--
-- The HTTP call uses X-Cron-Token (mirrors the run-drip-scheduler /
-- process-bulk-send-queue / weekly-digest pattern). The edge function
-- itself doesn't validate this token — the function is read-only from
-- a public-data perspective and idempotent on writes, so unauthenticated
-- invocation is acceptable. The header is preserved for log-grouping
-- + future tightening.
--
-- Schedule: 17 */4 * * * = every 4h at the :17 minute, offset from other
-- crons that fire on the hour.

SELECT cron.schedule(
  'refresh-ats-imports-every-4h',
  '17 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/refresh-ats-imports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'drip_scheduler_token' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);
