-- Close the anon-abuse gap on submit_public_job_rpc.
--
-- The specialty-scope (physician/PA) gate and the pay-transparency
-- salary-disclosure gate (2026-08-20 audit) were only enforced in Next.js:
-- client-side in post-job-form.tsx, and server-side in actions.ts's
-- submitPostJob before it calls this RPC. This RPC is SECURITY DEFINER and
-- directly EXECUTE-able by the public anon role via PostgREST
-- (/rest/v1/rpc/submit_public_job_rpc) -- confirmed via pg_proc.proacl
-- (anon=X/postgres). A caller bypassing the Next.js form entirely (a
-- scripted POST straight to PostgREST with the public anon key) could post
-- a physician/PA role, or a non-compliant CA/CO/NY/WA/etc. posting missing
-- its required salary range, with nothing here to stop it.
--
-- Fix: port the same checks into the RPC itself, matching this project's
-- existing pattern (this RPC already re-validates everything the Next.js
-- layer validates -- email shape, title/description length, enum values,
-- URL scheme, quota -- for exactly this "anon can call it directly" reason).
--
--   1. Specialty-scope: mirrors PHYSICIAN_OR_PA_PATTERNS +
--      MD_DO_CREDENTIAL_PATTERNS in src/lib/specialty-scope.ts (2026-08-20
--      audit round 2 version, which also closed the "Medical Director" gap
--      and added the "Physician-Owned"/"Physician Owned" business-descriptor
--      carve-out -- both included here from the start so the RPC never has
--      a window where it's behind the TS gate).
--   2. Pay-transparency salary-disclosure: mirrors validatePayTransparency()
--      in src/lib/pay-transparency.ts (state requires a real, non-remote,
--      min<=max salary range in CA/CO/NY/WA/HI/IL/MD/MN/NJ/VT/DC).
--
-- Applied live via Supabase MCP on 2026-08-20 (migration name
-- harden_submit_public_job_rpc_scope_checks); this file mirrors it for repo
-- history, matching this project's "live DB is truth, migrations document
-- it after the fact" convention. Same signature as before (CREATE OR
-- REPLACE, no dropped/re-added params), so existing grants (anon,
-- authenticated) are untouched.
--
-- Verified via scratch SELECTs against the exact regex/condition logic
-- below (not a live RPC call -- anon grants make an end-to-end call from
-- this tool impractical): all 32 specialty-scope.test.ts cases (existing +
-- new Medical Director / Physician-Owned regression cases) and 10
-- pay-transparency cases (missing/zero/min>max/remote-exempt/non-disclosure-
-- state/citation-lookup) matched expected outcomes.

create or replace function public.submit_public_job_rpc(p_contact_email text, p_contact_name text, p_company_name text, p_company_url text, p_title text, p_description text, p_role text, p_specialty text, p_city text, p_state text, p_remote_hybrid text, p_employment_type text, p_salary_min integer, p_salary_max integer, p_experience_required text, p_apply_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_employer_id uuid;
  v_employer public.public_employers;
  v_job_id uuid;
  v_slug text;
  v_slug_base text;
  v_suffix text;
  v_recent_count int;
  v_email_lc text;
  v_active_posts int;
  v_quota int;
  v_duration_days int;
  v_scope_hay text;
  v_cred_hay text;
  v_pay_citation text;
BEGIN
  IF p_contact_email IS NULL OR position('@' in p_contact_email) = 0 OR length(p_contact_email) > 254 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid email', 'code', 400);
  END IF;
  IF p_company_name IS NULL OR length(trim(p_company_name)) < 1 OR length(p_company_name) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company name must be 1-200 chars', 'code', 400);
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) < 3 OR length(p_title) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title must be 3-200 chars', 'code', 400);
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) < 30 OR length(p_description) > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Description must be 30-10000 chars', 'code', 400);
  END IF;
  IF p_remote_hybrid IS NOT NULL AND p_remote_hybrid NOT IN ('remote', 'hybrid', 'onsite') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid remote/hybrid value', 'code', 400);
  END IF;
  IF p_employment_type IS NOT NULL AND p_employment_type NOT IN ('full_time', 'part_time', 'contract', 'locum', 'per_diem', 'internship') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid employment type', 'code', 400);
  END IF;
  IF p_state IS NOT NULL AND p_state !~ '^[A-Z]{2}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'State must be a 2-letter code', 'code', 400);
  END IF;
  IF p_salary_min IS NOT NULL AND (p_salary_min < 0 OR p_salary_min > 10000000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Salary out of range', 'code', 400);
  END IF;
  IF p_salary_max IS NOT NULL AND (p_salary_max < 0 OR p_salary_max > 10000000) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Salary out of range', 'code', 400);
  END IF;
  IF p_apply_url IS NOT NULL AND p_apply_url <> '' AND p_apply_url !~ '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apply URL must be http(s)://', 'code', 400);
  END IF;
  -- S16C3 (2026-06-03) hardening: length-cap the remaining anon free-text fields.
  -- These are rate-limited + review-gated + escaped on render, but anon calls this
  -- RPC directly so bound untrusted input defensively (caps are generous vs real data).
  IF p_contact_name IS NOT NULL AND length(p_contact_name) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contact name too long (max 200)', 'code', 400);
  END IF;
  IF p_company_url IS NOT NULL AND length(p_company_url) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company URL too long (max 500)', 'code', 400);
  END IF;
  IF p_role IS NOT NULL AND length(p_role) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Role too long (max 200)', 'code', 400);
  END IF;
  IF p_specialty IS NOT NULL AND length(p_specialty) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Specialty too long (max 200)', 'code', 400);
  END IF;
  IF p_city IS NOT NULL AND length(p_city) > 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'City too long (max 200)', 'code', 400);
  END IF;
  IF p_experience_required IS NOT NULL AND length(p_experience_required) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Experience field too long (max 2000)', 'code', 400);
  END IF;

  -- Specialty-scope gate (2026-08-20 hardening): mirrors
  -- PHYSICIAN_OR_PA_PATTERNS + MD_DO_CREDENTIAL_PATTERNS in
  -- src/lib/specialty-scope.ts. "Physician-Owned"/"Physician Owned" is
  -- stripped first from both haystacks -- it describes the EMPLOYER's
  -- ownership structure, not the role being hired for, and would otherwise
  -- false-positive on the bare "physicians?" pattern (a hyphen is a word
  -- boundary). MD/DO bare-credential markers are checked against
  -- role+specialty only, never title, same reasoning as the TS version
  -- (title collides with the "MD" Maryland abbreviation and facility names
  -- like "MD Anderson").
  v_scope_hay := regexp_replace(
    coalesce(p_title, '') || ' ' || coalesce(p_role, '') || ' ' || coalesce(p_specialty, ''),
    '\mphysician[\s-]owned\M', ' ', 'gi'
  );
  v_cred_hay := regexp_replace(
    coalesce(p_role, '') || ' ' || coalesce(p_specialty, ''),
    '\mphysician[\s-]owned\M', ' ', 'gi'
  );
  IF v_scope_hay ~* '\y(physicians?|surgeons?|physician\s+assistants?|pa-c|cardiologists?|oncologists?|neurologists?|radiologists?|anesthesiologists?|psychiatrists?|dermatologists?|gastroenterologists?|obstetricians?|gynecologists?|pediatricians?|medical directors?)\y'
     OR v_cred_hay ~* '(^|[\s,/(])m\.?d\.?([\s,/)]|$)'
     OR v_cred_hay ~* '(^|[\s,/(])d\.?o\.?([\s,/)]|$)'
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ava Health posts nurse and allied-health roles only. Physician and PA roles are outside what we accept here.', 'code', 400);
  END IF;

  -- Pay-transparency salary-disclosure gate (2026-08-20 hardening): mirrors
  -- validatePayTransparency() in src/lib/pay-transparency.ts. Remote
  -- postings are exempt (the candidate's state controls, not the
  -- employer's, and we don't know it yet at post-time) -- same exemption
  -- actions.ts applies before calling this RPC. p_state is already
  -- guaranteed NULL or a valid 2-letter uppercase code by the check above.
  v_pay_citation := CASE p_state
    WHEN 'CA' THEN 'CA SB 1162'
    WHEN 'CO' THEN 'CO Equal Pay Act'
    WHEN 'NY' THEN 'NY S9427-A'
    WHEN 'WA' THEN 'WA SB 5761'
    WHEN 'HI' THEN 'HI HB 2657'
    WHEN 'IL' THEN 'IL HB 3129'
    WHEN 'MD' THEN 'MD HB 649'
    WHEN 'MN' THEN 'MN H 4444'
    WHEN 'NJ' THEN 'NJ A4151'
    WHEN 'VT' THEN 'VT H 704'
    WHEN 'DC' THEN 'DC B25-194'
    ELSE NULL
  END;
  IF coalesce(p_remote_hybrid, 'onsite') <> 'remote' AND v_pay_citation IS NOT NULL THEN
    IF p_salary_min IS NULL OR p_salary_max IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', format('%s requires a posted salary range (%s). Add both a minimum and a maximum salary to continue.', p_state, v_pay_citation), 'code', 400);
    ELSIF p_salary_min <= 0 OR p_salary_max <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', format('%s requires a real salary range (%s). Zero is not a valid minimum or maximum.', p_state, v_pay_citation), 'code', 400);
    ELSIF p_salary_min > p_salary_max THEN
      RETURN jsonb_build_object('success', false, 'error', 'Salary minimum can''t be higher than the maximum.', 'code', 400);
    END IF;
  END IF;

  v_email_lc := lower(p_contact_email);

  SELECT count(*) INTO v_recent_count
  FROM public.public_jobs pj
  JOIN public.public_employers pe ON pj.employer_id = pe.id
  WHERE lower(pe.contact_email) = v_email_lc
    AND pj.created_at >= (now() - interval '24 hours');
  IF v_recent_count >= 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'That''s a lot of posts in a short window. Try again in a few hours, or email ally@avahealth.co if you''re onboarding a big roster.',
      'code', 429
    );
  END IF;

  SELECT id INTO v_employer_id
  FROM public.public_employers
  WHERE lower(contact_email) = v_email_lc
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_employer_id IS NULL THEN
    INSERT INTO public.public_employers (
      company_name, company_url, contact_name, contact_email,
      verified_at, status, vertical, tier
    ) VALUES (
      trim(p_company_name),
      NULLIF(trim(coalesce(p_company_url, '')), ''),
      NULLIF(trim(coalesce(p_contact_name, '')), ''),
      v_email_lc,
      NULL,
      'pending',
      'healthcare',
      'free'
    ) RETURNING id INTO v_employer_id;
  END IF;

  SELECT * INTO v_employer FROM public.public_employers WHERE id = v_employer_id;

  v_quota := CASE v_employer.tier
    WHEN 'free' THEN 10
    WHEN 'plus' THEN 15
    WHEN 'pro' THEN 999999
    WHEN 'enterprise' THEN 999999
    ELSE 10
  END;

  v_duration_days := 90;

  IF v_employer.tier_expires_at IS NOT NULL AND v_employer.tier_expires_at < now() THEN
    v_quota := 10;
  END IF;

  SELECT count(*) INTO v_active_posts
  FROM public.public_jobs
  WHERE employer_id = v_employer_id
    AND deleted_at IS NULL
    AND status IN ('active', 'pending_review')
    AND expires_at > now();

  IF v_active_posts >= v_quota THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'You already have %s job posts running — archive any that are filled to open up a slot. Need more ongoing capacity? Email ally@avahealth.co and we''ll sort it.',
        v_active_posts
      ),
      'code', 402,
      'active_posts', v_active_posts,
      'tier', v_employer.tier,
      'quota', v_quota
    );
  END IF;

  v_slug_base := public.slugify(p_title);
  IF v_slug_base IS NULL OR length(v_slug_base) = 0 THEN
    v_slug_base := 'healthcare-role';
  END IF;
  v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  v_slug := v_slug_base || '-' || v_suffix;
  WHILE EXISTS (SELECT 1 FROM public.public_jobs WHERE slug = v_slug) LOOP
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := v_slug_base || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.public_jobs (
    employer_id, slug, title, description, role, specialty, vertical,
    city, state, remote_hybrid, employment_type,
    salary_min, salary_max, experience_required, apply_url,
    contact_email, status, source,
    expires_at
  ) VALUES (
    v_employer_id,
    v_slug,
    trim(p_title),
    trim(p_description),
    NULLIF(trim(coalesce(p_role, '')), ''),
    NULLIF(trim(coalesce(p_specialty, '')), ''),
    'healthcare',
    NULLIF(trim(coalesce(p_city, '')), ''),
    NULLIF(upper(trim(coalesce(p_state, ''))), ''),
    coalesce(p_remote_hybrid, 'onsite'),
    coalesce(p_employment_type, 'full_time'),
    p_salary_min,
    p_salary_max,
    NULLIF(trim(coalesce(p_experience_required, '')), ''),
    NULLIF(trim(coalesce(p_apply_url, '')), ''),
    v_email_lc,
    'pending_review',
    'public_employer_post',
    now() + make_interval(days => v_duration_days)
  ) RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'employer_id', v_employer_id,
    'job_id', v_job_id,
    'job_slug', v_slug,
    'tier', v_employer.tier,
    'active_posts', v_active_posts + 1,
    'quota', v_quota,
    'code', 201
  );
END;
$function$;

-- Verify:
--   SELECT pg_get_function_identity_arguments(p.oid), p.proacl
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'submit_public_job_rpc';
--   -- should show the same 16-arg signature and the same acl as before
--   -- (postgres, anon, authenticated) -- CREATE OR REPLACE with an
--   -- unchanged signature doesn't touch grants.
