-- Backfill migration for two RPCs that have been live in production for
-- months but were never captured as a migration file. Both were
-- evidently created directly against the live DB (SQL Editor / MCP
-- execute_sql) rather than through the normal migration flow, so the
-- migration folder could not be used to reconstruct this project's
-- schema on its own.
--
-- get_vault_secret(secret_name) — called by refresh-ats-imports
-- (usajobs_api_key) and adzuna-ingest (adzuna_app_id, adzuna_app_key) on
-- every cron tick to read API credentials out of Supabase Vault.
--
-- record_apply_notify_send(...) — called by apply-notify on every
-- application notification for durable audit logging into
-- public.email_sends.
--
-- Definitions and grants below were pulled verbatim from the live DB
-- (pg_get_functiondef() / pg_proc.proacl via the SQL Editor) on
-- 2026-08-06 and are committed here as CREATE OR REPLACE so this
-- migration is a no-op against the already-live functions. Pure
-- documentation catch-up — no behavior change, nothing to deploy.

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name;
  RETURN v_secret;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vault_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_apply_notify_send(
  p_application_id uuid,
  p_to_email text,
  p_from_email text,
  p_from_name text,
  p_subject text,
  p_status text,
  p_error text DEFAULT NULL::text,
  p_resend_id text DEFAULT NULL::text,
  p_candidate_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Only record for a real application (bounds anon abuse to existing application_ids).
  IF p_application_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.public_applications WHERE id = p_application_id) THEN
    RETURN;
  END IF;

  IF p_to_email IS NULL OR p_from_email IS NULL OR p_subject IS NULL OR p_status IS NULL THEN
    RETURN; -- email_sends NOT-NULL guards; never raise into the caller
  END IF;

  INSERT INTO public.email_sends (
    candidate_id, candidate_type, to_email, from_email, from_name,
    subject, body_preview, resend_id, status, error, sent_at
  ) VALUES (
    p_candidate_id, 'unknown', left(p_to_email, 254), left(p_from_email, 254), p_from_name,
    left(p_subject, 300), '[apply_notify] employer notification', p_resend_id,
    p_status, left(p_error, 1000), CASE WHEN p_status = 'sent' THEN now() ELSE NULL END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_apply_notify_send(uuid, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_apply_notify_send(uuid, text, text, text, text, text, text, text, uuid) TO service_role;
