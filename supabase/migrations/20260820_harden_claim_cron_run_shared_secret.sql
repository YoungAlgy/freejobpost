-- Close the anon-abuse gap on claim_cron_run.
--
-- Before this: claim_cron_run(p_job, p_min_minutes) validated only the
-- job-name shape and the interval bounds -- not the caller's identity. It is
-- granted EXECUTE to anon (needed so freejobpost's server-side client can
-- call it), which means anyone holding the public anon key could call it
-- directly via PostgREST (/rest/v1/rpc/claim_cron_run) with a guessed job
-- name (e.g. 'freejob_revalidate_expired', visible in freejobpost's own
-- source) and pre-claim the lock, making the *real* pg_cron-triggered call
-- silently no-op ("ran recently") for up to p_min_minutes. Its only caller,
-- src/app/api/revalidate-expired/route.ts, only reaches this RPC as a
-- fallback when its own optional CRON_SECRET Vercel env var isn't
-- configured -- so the fix can't depend on that var either, or it does
-- nothing in exactly the case it needs to cover.
--
-- Fix: verify a shared secret inside the function itself, independent of any
-- app-side config. pg_cron already attaches the project's shared
-- 'drip_scheduler_token' vault secret as an X-Cron-Token header on every
-- invocation of the revalidate-expired route (see cron.job
-- 'freejob-revalidate-expired'), the same secret used for this purpose by
-- daily_telnyx_balance_check and cron_health_check elsewhere in this shared
-- Supabase project. route.ts is updated in the same change to forward that
-- header through as the new p_token argument, so the legitimate fallback
-- call keeps working with zero new env-var dependency -- while a caller with
-- no/wrong token gets the same "false" the rate limiter already returns, so
-- this can't be used as an auth-vs-rate-limit oracle.
--
-- Applied live via Supabase MCP on 2026-08-20 (migration name
-- harden_claim_cron_run_shared_secret); this file mirrors it for repo
-- history, matching this project's "live DB is truth, migrations document
-- it after the fact" convention (claim_cron_run's original CREATE was never
-- checked into either repo's migrations folder either).

drop function if exists public.claim_cron_run(text, integer);

create or replace function public.claim_cron_run(p_job text, p_min_minutes integer, p_token text default null)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'drip_scheduler_token' limit 1;

  -- Fail closed: a missing vault secret, a missing token, or a mismatch all
  -- reject the same way -- never distinguish "wrong token" from "rate
  -- limited" in the return value.
  if v_secret is null or p_token is null or p_token <> v_secret then
    return false;
  end if;

  -- Bounds: known-shaped job names only, interval between 5 min and 24h.
  if p_job is null or p_job !~ '^[a-z0-9_]{4,64}$'
     or p_min_minutes is null or p_min_minutes < 5 or p_min_minutes > 1440 then
    return false;
  end if;

  insert into public.app_cron_locks (job, last_run)
  values (p_job, now())
  on conflict (job) do update set last_run = now()
  where app_cron_locks.last_run < now() - make_interval(mins => p_min_minutes);
  return found;  -- false when the conflict UPDATE's WHERE filtered (ran too recently, or already returned above)
end;
$function$;

revoke all on function public.claim_cron_run(text, integer, text) from public;
grant execute on function public.claim_cron_run(text, integer, text) to anon, authenticated, service_role;

-- Verify:
--   SELECT pg_get_function_identity_arguments(p.oid), p.proacl
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'claim_cron_run';
--   -- should show exactly one row, 3-arg signature, acl unchanged
--   -- (postgres, anon, authenticated, service_role).
