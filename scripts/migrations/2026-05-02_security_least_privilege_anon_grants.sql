-- Security audit cleanup: revoke EXECUTE on internal/trigger functions from
-- anon (and PUBLIC). These functions had anon EXECUTE grants that were never
-- needed and aren't exploitable today (internal_user checks + trigger calling
-- conventions guard them) — but the surface should be zero, not "guarded by
-- defense-in-depth."
--
-- Functions affected:
--   - therapists_view_delete_fn, therapists_view_insert_fn,
--     therapists_view_update_fn — INSTEAD OF triggers on therapists_view.
--     Trigger functions don't need EXECUTE grants for normal operation;
--     PostgreSQL invokes them as the table owner via the trigger system.
--   - trg_autoassign_candidate, update_facility_last_activity — same; both
--     return TRIGGER and are wired up as row-level triggers elsewhere.
--   - start_user_trial — RPC for authenticated users only (uses auth.uid()).
--     If anon called it, auth.uid() is NULL and the INSERT would violate the
--     NOT NULL on user_subscriptions.user_id, but the EXECUTE grant should
--     never have been there. Restrict to authenticated.
--
-- This does NOT affect any of the actually anon-callable RPCs:
--   - submit_public_job_rpc, submit_public_candidate_rpc (public form posts)
--   - update_public_candidate_rpc, consume_candidate_edit_rpc (nonce-gated edits)
--   - apply_to_job_rpc, get_apply_notify_context_rpc (apply flow)
--   - consume_post_job_verification_rpc (post-job verify)
--   - request_employer_login_rpc (magic-link send)
--   - set_pending_job_syndication_targets (called by post-job server action)
--
-- Verification queries are below the COMMIT for spot-checking after apply.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.therapists_view_delete_fn() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.therapists_view_insert_fn() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.therapists_view_update_fn() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_autoassign_candidate() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_facility_last_activity() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_user_trial() FROM anon, PUBLIC;

COMMIT;

-- Verification (uncomment to run):
-- SELECT p.proname,
--   has_function_privilege('anon', p.oid, 'execute') AS anon,
--   has_function_privilege('authenticated', p.oid, 'execute') AS authenticated
-- FROM pg_proc p
-- WHERE p.proname IN (
--   'therapists_view_delete_fn','therapists_view_insert_fn',
--   'therapists_view_update_fn','trg_autoassign_candidate',
--   'update_facility_last_activity','start_user_trial'
-- )
-- ORDER BY p.proname;
