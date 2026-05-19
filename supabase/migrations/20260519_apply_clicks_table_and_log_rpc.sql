-- apply_clicks: per-job, per-partner click attribution log.
--
-- This is the data layer for the "Apply-click logging (per-job, per-partner)"
-- capability that distinguishes a real publisher feed from a "submit URL to
-- 100 sites" SEO toy. Every outbound apply click from /click/[slug]?p=<partner>
-- inserts one row. Partners (Indeed, Talent.com, Adzuna, etc.) can then be
-- shown verifiable attribution data.
--
-- IP is hashed (not stored raw) for privacy compliance + GDPR / CCPA friendly.
-- We keep only the first 8 hex chars of SHA-256, which is enough to dedupe
-- bursts from the same client without re-identifying anyone.

CREATE TABLE IF NOT EXISTS public.apply_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.public_jobs(id) ON DELETE CASCADE,
  job_slug text NOT NULL,
  partner text NOT NULL,
  user_agent text,
  ip_hash text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The hot reads we'll do:
--   1) "how many clicks did partner X drive last week?"
--   2) "what's job Y's click curve since posting?"
-- Two indexes cover both.
CREATE INDEX IF NOT EXISTS apply_clicks_partner_created_idx
  ON public.apply_clicks (partner, created_at DESC);
CREATE INDEX IF NOT EXISTS apply_clicks_job_created_idx
  ON public.apply_clicks (job_id, created_at DESC);

-- RLS: lock down direct access. All writes flow through the RPC; reads are
-- internal-user only (for the future analytics dashboard).
ALTER TABLE public.apply_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apply_clicks_internal_read" ON public.apply_clicks;
CREATE POLICY "apply_clicks_internal_read"
  ON public.apply_clicks
  FOR SELECT
  USING (public.is_internal_user());

COMMENT ON TABLE public.apply_clicks IS
  'Per-job per-partner apply-click attribution log. Insert via log_apply_click() RPC. Reads gated to internal users for the future analytics dashboard.';

-- log_apply_click: append a single attribution row + bump the job's
-- apply_count denormalized counter. Returns the new click id, or NULL when
-- the slug doesn't resolve to an active job (caller should still redirect).
--
-- SECURITY DEFINER + REVOKE/GRANT pattern matches the existing project
-- standard (get_ats_existing_refs_jsonb, ats_import_upsert_jobs, etc).
-- service_role has no direct grants on public_jobs.
CREATE OR REPLACE FUNCTION public.log_apply_click(
  p_slug text,
  p_partner text,
  p_user_agent text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_referrer text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
  v_click_id uuid;
  -- Normalize partner key. 'internal' covers the on-site Apply button;
  -- partner-fed traffic uses lowercase keys (talent, adzuna, jooble, etc.).
  v_partner text := lower(trim(coalesce(p_partner, 'internal')));
BEGIN
  -- Reject obviously bad input early; partner key is the only field we
  -- can't easily sanitize at write time.
  IF v_partner = '' OR length(v_partner) > 64 THEN
    v_partner := 'internal';
  END IF;

  SELECT id INTO v_job_id
  FROM public.public_jobs
  WHERE slug = p_slug
    AND status = 'active'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.apply_clicks (job_id, job_slug, partner, user_agent, ip_hash, referrer)
  VALUES (v_job_id, p_slug, v_partner, p_user_agent, p_ip_hash, p_referrer)
  RETURNING id INTO v_click_id;

  UPDATE public.public_jobs
     SET apply_count = apply_count + 1
   WHERE id = v_job_id;

  RETURN v_click_id;
END;
$$;

-- The click endpoint runs anon-side from the public web. anon needs EXECUTE.
-- authenticated is included for completeness (logged-in candidates also click).
REVOKE EXECUTE ON FUNCTION public.log_apply_click(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_apply_click(text, text, text, text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.log_apply_click(text, text, text, text, text) IS
  'Inserts one apply_clicks row + bumps public_jobs.apply_count for the slug. Returns the new click id, or NULL when the slug does not match an active job. SECURITY DEFINER so anon-tier callers (the /click/[slug] redirect endpoint) can write without direct table grants.';
