-- NOT APPLIED LIVE.
--
-- FreeJobPost rolling release, RETIRE STEP. Apply the 230000 expand source
-- first, deploy and verify the Worker that calls submit_freejobpost_job_rpc,
-- move it to 100 percent traffic, wait for requests from the prior Worker to
-- drain, and explicitly close the prior-Worker rollback window. Capture the
-- live grants again immediately before this step.
--
-- Do not run this source while any old Worker can still receive traffic. The
-- old posting action calls submit_public_job_rpc and then
-- set_pending_job_syndication_targets. Revoking either grant early breaks live
-- employer submissions.
--
-- After this step, the recorded prior Worker is no longer a database-compatible
-- rollback target. Restoring that Worker requires restoring the exact grants
-- captured before this step first.

BEGIN;

REVOKE ALL ON FUNCTION public.submit_public_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.set_pending_job_syndication_targets(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pending_job_syndication_targets(uuid, text[])
  TO service_role;

COMMIT;
