-- Fix check_employer_quota to match submit_public_job_rpc's real tier quotas.
--
-- check_employer_quota (the pre-flight gate called by src/app/post-job/actions.ts
-- before submit_public_job_rpc runs) hardcoded a single `v_quota := 10` for
-- every tier other than pro/enterprise, and only special-cased pro/enterprise
-- to skip the check entirely. submit_public_job_rpc -- the RPC that actually
-- creates the job -- has always given 'plus' tier a real quota of 15
-- (CASE v_employer.tier WHEN 'free' THEN 10 WHEN 'plus' THEN 15 ...). A
-- 'plus'-tier employer with 10-14 active posts would pass the RPC's own
-- quota check but get wrongly blocked by this earlier pre-flight gate, which
-- never even calls the RPC in that case.
--
-- Same signature, same return shape -- just the quota computation is now
-- tier-aware to match the authoritative RPC. No 'plus'-tier employers exist
-- in the live DB yet, so this closes a latent bug rather than one causing
-- live incidents today.
CREATE OR REPLACE FUNCTION public.check_employer_quota(p_contact_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employer record;
  v_active_count int;
  v_quota int;
  v_call_count int;
BEGIN
  UPDATE public.check_employer_quota_rate_limit
     SET window_start = CASE WHEN window_start < now() - interval '1 minute' THEN now() ELSE window_start END,
         call_count   = CASE WHEN window_start < now() - interval '1 minute' THEN 1 ELSE call_count + 1 END
   WHERE id = true
   RETURNING call_count INTO v_call_count;

  IF v_call_count IS NOT NULL AND v_call_count > 120 THEN
    RETURN jsonb_build_object('over_quota', false, 'active_count', null, 'quota', null, 'error', 'rate_limited');
  END IF;

  SELECT id, tier INTO v_employer
  FROM public_employers
  WHERE lower(contact_email) = lower(p_contact_email)
  LIMIT 1;

  IF v_employer IS NULL THEN
    RETURN jsonb_build_object('over_quota', false, 'active_count', 0, 'quota', 10);
  END IF;

  IF v_employer.tier IN ('pro', 'enterprise') THEN
    RETURN jsonb_build_object('over_quota', false, 'active_count', null, 'quota', null);
  END IF;

  v_quota := CASE v_employer.tier
    WHEN 'plus' THEN 15
    ELSE 10
  END;

  SELECT count(*) INTO v_active_count
  FROM public_jobs
  WHERE employer_id = v_employer.id
    AND status IN ('active', 'pending_review')
    AND expires_at > now();

  RETURN jsonb_build_object(
    'over_quota', v_active_count >= v_quota,
    'active_count', v_active_count,
    'quota', v_quota
  );
END;
$function$
