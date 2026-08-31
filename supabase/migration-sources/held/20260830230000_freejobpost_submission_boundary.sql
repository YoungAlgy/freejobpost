-- NOT APPLIED LIVE.
--
-- FreeJobPost is a standalone nursing and allied-health job product. The old
-- public RPC still contains Ava-branded errors and accepts HTTP apply URLs.
-- This wrapper gives the standalone app its own contract, validates external
-- URLs, assigns the reviewed partner list in the same transaction as the new
-- job, and removes direct public execution from the legacy RPC without
-- rewriting its already-applied historical definition.
--
-- Release gate: capture the live function definitions and grants first. Apply
-- this with the matching frontend change as one release. Do not deploy the
-- frontend first because the wrapper name does not exist live yet.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_freejobpost_job_rpc(
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
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
  result_error text;
  result_job_id uuid;
  updated_jobs integer;
  normalized_apply_url text := nullif(trim(p_apply_url), '');
  normalized_company_url text := nullif(trim(p_company_url), '');
  apply_authority text := split_part(split_part(split_part(substr(normalized_apply_url, 9), '/', 1), '?', 1), '#', 1);
  company_authority text := split_part(split_part(split_part(substr(normalized_company_url, 9), '/', 1), '?', 1), '#', 1);
  reviewed_syndication_targets constant text[] := ARRAY[
    'indeed', 'ziprecruiter', 'glassdoor', 'google', 'adzuna',
    'jooble', 'talent', 'careerjet', 'rss'
  ]::text[];
  safe_https_pattern constant text :=
    '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?([/?#][^[:space:]]*)?$';
BEGIN
  IF normalized_apply_url IS NOT NULL
     AND (
       length(normalized_apply_url) > 500
       OR normalized_apply_url !~* safe_https_pattern
       OR normalized_apply_url ~ '[[:space:][:cntrl:]]'
       OR apply_authority ~* '^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+))*(:[0-9]{1,5})?$'
     )
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'External apply links must be valid HTTPS URLs without embedded credentials.',
      'code', 400
    );
  END IF;

  IF normalized_company_url IS NOT NULL
     AND (
       length(normalized_company_url) > 500
       OR normalized_company_url !~* safe_https_pattern
       OR normalized_company_url ~ '[[:space:][:cntrl:]]'
       OR company_authority ~* '^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+))*(:[0-9]{1,5})?$'
     )
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Company websites must be valid HTTPS URLs without embedded credentials.',
      'code', 400
    );
  END IF;

  result := public.submit_public_job_rpc(
    p_contact_email,
    p_contact_name,
    p_company_name,
    normalized_company_url,
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
    normalized_apply_url
  );

  IF coalesce((result ->> 'success')::boolean, false) THEN
    BEGIN
      result_job_id := (result ->> 'job_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'submit_public_job_rpc returned an invalid job_id';
    END;

    IF result_job_id IS NULL THEN
      RAISE EXCEPTION 'submit_public_job_rpc returned no job_id';
    END IF;

    UPDATE public.public_jobs
    SET syndication_targets = reviewed_syndication_targets
    WHERE id = result_job_id
      AND source = 'public_employer_post'
      AND status = 'pending_review';

    GET DIAGNOSTICS updated_jobs = ROW_COUNT;
    IF updated_jobs <> 1 THEN
      RAISE EXCEPTION 'new FreeJobPost row did not match the expected source and status';
    END IF;

    RETURN result;
  END IF;

  result_error := coalesce(result ->> 'error', 'Submission rejected.');
  IF result_error LIKE 'Ava Health posts nurse and allied-health roles only.%' THEN
    RETURN result || jsonb_build_object(
      'error', 'FreeJobPost accepts nursing and allied-health roles only. Physician and PA roles are outside this job board.'
    );
  END IF;

  IF result_error LIKE 'That''s a lot of posts in a short window.%' THEN
    RETURN result || jsonb_build_object(
      'error', 'That''s a lot of posts in a short window. Try again in a few hours.'
    );
  END IF;

  IF result_error LIKE 'You already have %job posts running%' THEN
    RETURN result || jsonb_build_object(
      'error', format(
        'You already have %s active job posts. Archive a filled role before posting another.',
        coalesce(result ->> 'active_posts', 'your maximum number of')
      )
    );
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_freejobpost_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_freejobpost_job_rpc(
  text, text, text, text, text, text, text, text,
  text, text, text, text, integer, integer, text, text
) TO anon, authenticated, service_role;

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

-- A table-level HTTPS constraint is deliberately deferred. PostgreSQL checks
-- a NOT VALID constraint on later row updates, so older HTTP rows could become
-- uneditable. Count and clean those rows read-only before a separate constraint
-- migration is prepared.

COMMIT;
