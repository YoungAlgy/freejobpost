-- 2026-05-13 — Server-side 10-post quota enforcement for freejobpost
--
-- Why this migration exists:
--   Today the 10-active-post cap on the free tier is enforced only in the
--   employer dashboard UI (`employer/dashboard.tsx:FREE_QUOTA = 10`). The
--   post-job server action (`post-job/actions.ts`) calls `submit_public_job_rpc`
--   without any tier/count check, so a determined client could exceed the cap
--   by scripting the endpoint. With no real paying employers today this is
--   theoretical, but it must be fixed before any payment gate is shipped
--   (otherwise paying customers would be paying for something the free tier
--   could bypass).
--
-- What this migration does:
--   Adds a pure-read helper function `check_employer_quota(text)` that the
--   TypeScript pre-flight check calls before submit_public_job_rpc. The RPC
--   itself is unchanged here — the check happens client-side-of-DB but
--   server-side-of-app, with a small TOCTOU window that's acceptable at
--   current scale (one in-flight submission per employer email).
--
-- APPLIED 2026-05-13 via Supabase MCP to project `tsruqbodyrmxqzhvxret`.
-- Migration name on record: `check_employer_quota_helper_v2_correct_tables`.
-- (v1 used `employers`/`jobs` table names which don't exist in this project —
-- the correct base tables are `public_employers` and `public_jobs`. PL/pgSQL
-- is late-bound so v1's CREATE OR REPLACE succeeded but errored at call.)
--
-- After this lands, the TypeScript code in post-job/actions.ts (deployed
-- with graceful fallback) starts actually enforcing the cap.
--
-- Rollback: DROP FUNCTION public.check_employer_quota(text);
--   The TS code will silently fall back to no-check (current behavior).

CREATE OR REPLACE FUNCTION public.check_employer_quota(p_contact_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer record;
  v_active_count int;
  v_quota constant int := 10;
BEGIN
  -- Locate the employer row by contact_email (case-insensitive). The
  -- post-job RPC normalizes contact_email to lowercase before insert, so
  -- this matches existing rows reliably.
  SELECT id, tier INTO v_employer
  FROM public_employers
  WHERE lower(contact_email) = lower(p_contact_email)
  LIMIT 1;

  -- No employer row yet = first-time poster. They're at 0 active jobs, so
  -- the quota check is trivially satisfied. Skip counting; allow.
  IF v_employer IS NULL THEN
    RETURN jsonb_build_object(
      'over_quota', false,
      'tier', null,
      'active_count', 0,
      'quota', v_quota
    );
  END IF;

  -- Pro and enterprise tiers are explicitly uncapped per the existing
  -- dashboard logic (`employer/dashboard.tsx:60-63`). Match that semantics.
  IF v_employer.tier IN ('pro', 'enterprise') THEN
    RETURN jsonb_build_object(
      'over_quota', false,
      'tier', v_employer.tier,
      'active_count', null,
      'quota', null
    );
  END IF;

  -- Free tier: count active + pending_review jobs that haven't expired.
  -- Matches the dashboard's active-filter (status IN ('active','pending_review')
  -- AND expires_at > now()). Cap is FREE_QUOTA = 10.
  SELECT count(*) INTO v_active_count
  FROM public_jobs
  WHERE employer_id = v_employer.id
    AND status IN ('active', 'pending_review')
    AND expires_at > now();

  RETURN jsonb_build_object(
    'over_quota', v_active_count >= v_quota,
    'tier', v_employer.tier,
    'active_count', v_active_count,
    'quota', v_quota
  );
END;
$$;

-- Lock down execution: only anon and authenticated roles can call (matches
-- the app's auth surface). PUBLIC is revoked as a defense-in-depth measure.
REVOKE ALL ON FUNCTION public.check_employer_quota(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_employer_quota(text) TO anon, authenticated;

-- Smoke test (run after CREATE; should return over_quota: false for a
-- non-existent email):
-- SELECT public.check_employer_quota('nobody@example.invalid');
