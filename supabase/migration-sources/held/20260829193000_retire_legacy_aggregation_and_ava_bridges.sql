-- HELD SOURCE ONLY. DO NOT APPLY FROM THIS DIRECTORY.
--
-- Purpose:
--   * stop the three aggregate-job cron families;
--   * remove non-owner execution access from aggregate import/backfill RPCs;
--   * remove non-owner execution access from automatic candidate matching;
--   * close the Ava CRM candidate publishing/revocation bridge;
--   * keep every historical job, employer, candidate, application, and match row;
--   * wrap the public posting RPC so no legacy Ava mailbox or product name can
--     escape from its already-deployed function body.
--
-- Required before release:
--   * fresh successful database backup;
--   * current cron/function/role inventory from the owning Supabase project;
--   * confirmation that FreeResumePost no longer depends on these bridge or
--     matching calls;
--   * isolated apply and rollback rehearsal;
--   * explicit production approval.

BEGIN;

-- Stop new aggregate imports and imported-description maintenance. Querying by
-- exact job name makes this idempotent and leaves unrelated schedules alone.
DO $retire_crons$
DECLARE
  v_job_name text;
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'cron.job is not installed; no legacy schedules to retire';
    RETURN;
  END IF;

  FOREACH v_job_name IN ARRAY ARRAY[
    'refresh-ats-imports-every-4h',
    'adzuna-ingest-every-4h',
    'backfill-workday-descriptions-every-4h',
    'backfill-workday-descriptions-every-2h'
  ]
  LOOP
    v_job_id := NULL;
    EXECUTE 'SELECT jobid FROM cron.job WHERE jobname = $1 ORDER BY jobid LIMIT 1'
      INTO v_job_id
      USING v_job_name;

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;
  END LOOP;
END
$retire_crons$;

-- Keep the old functions available to the database owner for audit and an
-- intentional rollback. Remove every application-role path that could restart
-- imports, backfills, auto matching, or the Ava-to-candidate bridge.
DO $retire_functions$
DECLARE
  v_signature text;
BEGIN
  FOR v_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'ats_import_upsert_jobs',
        'get_ats_existing_refs',
        'get_ats_existing_refs_jsonb',
        'get_workday_backfill_candidates',
        'apply_workday_description_backfill',
        'refresh_marketplace_matches',
        'score_candidate_for_job',
        'cross_site_create_candidate_profile',
        'cross_site_revoke_candidate_profile'
      ])
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_signature
    );
  END LOOP;
END
$retire_functions$;

-- The deployed posting RPC predates the standalone brand and contains three
-- fallback messages with the Ava name or mailbox. Preserve its reviewed body
-- under an owner-only legacy name, then expose a same-signature compatibility
-- wrapper that rewrites only those messages.
DO $rename_submit_rpc$
BEGIN
  IF to_regprocedure(
    'public.submit_public_job_rpc_legacy(text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,text,text)'
  ) IS NULL THEN
    IF to_regprocedure(
      'public.submit_public_job_rpc(text,text,text,text,text,text,text,text,text,text,text,text,integer,integer,text,text)'
    ) IS NULL THEN
      RAISE EXCEPTION 'submit_public_job_rpc expected signature is missing';
    END IF;

    ALTER FUNCTION public.submit_public_job_rpc(
      text, text, text, text, text, text, text, text,
      text, text, text, text, integer, integer, text, text
    ) RENAME TO submit_public_job_rpc_legacy;
  END IF;
END
$rename_submit_rpc$;

REVOKE ALL ON FUNCTION public.submit_public_job_rpc_legacy(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_public_job_rpc(
  p_contact_email text,
  p_contact_name text,
  p_company_name text,
  p_company_url text,
  p_title text,
  p_description text,
  p_role text,
  p_specialty text,
  p_city text,
  p_state text,
  p_remote_hybrid text,
  p_employment_type text,
  p_salary_min integer,
  p_salary_max integer,
  p_experience_required text,
  p_apply_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $standalone_submit$
DECLARE
  v_result jsonb;
  v_error text;
BEGIN
  v_result := public.submit_public_job_rpc_legacy(
    p_contact_email,
    p_contact_name,
    p_company_name,
    p_company_url,
    p_title,
    p_description,
    p_role,
    p_specialty,
    p_city,
    p_state,
    p_remote_hybrid,
    p_employment_type,
    p_salary_min,
    p_salary_max,
    p_experience_required,
    p_apply_url
  );

  v_error := v_result ->> 'error';

  IF v_error LIKE 'Ava Health posts nurse and allied-health roles only.%' THEN
    v_result := jsonb_set(
      v_result,
      '{error}',
      to_jsonb(
        'FreeJobPost accepts nursing and allied-health roles only. Physician and PA roles are outside what we accept here.'::text
      )
    );
  ELSIF v_error LIKE 'That''s a lot of posts in a short window.%ally@avahealth.co%' THEN
    v_result := jsonb_set(
      v_result,
      '{error}',
      to_jsonb('That''s a lot of posts in a short window. Try again in a few hours.'::text)
    );
  ELSIF v_error LIKE 'You already have %ally@avahealth.co%' THEN
    v_result := jsonb_set(
      v_result,
      '{error}',
      to_jsonb(split_part(v_error, ' Need more ongoing capacity?', 1))
    );
  END IF;

  RETURN v_result;
END
$standalone_submit$;

REVOKE ALL ON FUNCTION public.submit_public_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) TO anon, authenticated, service_role;

-- Deliberately absent: DELETE, UPDATE, TRUNCATE, DROP TABLE, or column changes.
-- Historical rows and rollback evidence stay intact.

COMMIT;
