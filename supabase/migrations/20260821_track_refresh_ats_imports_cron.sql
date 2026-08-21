-- Phase 0 cleanup (2026-08-21 infra untangling, ahead of freejobpost's move to
-- its own Supabase project): the refresh-ats-imports-every-4h cron job has
-- been live since 2026-05-14, but its only record anywhere was an archived,
-- never-tracked script (scripts/_archive/202608/2026-05-14_refresh_ats_imports_cron.sql)
-- applied by hand via the Supabase MCP. If that file were ever lost, this
-- job's existence and exact schedule/config would be unrecoverable. This
-- migration is that missing record — cron.schedule() with an existing job
-- name updates it in place (upsert on name), so re-running this against the
-- already-running job is a no-op, not a duplicate/disruption.
--
-- Unlike this repo's other 4h crons (adzuna-ingest, backfill-workday-descriptions),
-- this one intentionally does NOT check X-Cron-Token: the function is
-- read-only from a public-data perspective and idempotent on writes, so
-- unauthenticated invocation is accepted. The header is still sent for
-- log-grouping and to make future tightening a one-line change.

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
