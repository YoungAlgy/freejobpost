-- partner_attribution_daily: rollup of apply_clicks for the partner-
-- attribution dashboard (Layer 1D of the 2026-05-19 plan).
--
-- One row per (partner, day) with click_count, unique_jobs (distinct
-- job_slug touched that day), and unique_ips (distinct ip_hash — a noisy
-- proxy for unique people, since ip_hash is the truncated SHA-256 of the
-- client IP so two browsers behind the same NAT collapse to one).
--
-- Internal-only: gated to internal users OR service_role (the latter so
-- server-side admin pages on the Next.js side can read the rollup via
-- the service-role key without auth.uid() being set).
--
-- Refreshes on every query — apply_clicks volume is currently low and this
-- view is queried interactively. Materialize later if it gets hot.

CREATE OR REPLACE VIEW public.partner_attribution_daily
WITH (security_barrier=true)
AS
  SELECT
    partner,
    date_trunc('day', created_at) AS day,
    COUNT(*) AS click_count,
    COUNT(DISTINCT job_slug) AS unique_jobs,
    COUNT(DISTINCT ip_hash) AS unique_ips
  FROM public.apply_clicks
  WHERE
    -- service_role: server-side admin pages with the service-role key
    -- (e.g. /admin/attribution) get the full rollup. service-role
    -- bypasses RLS on tables but NOT query-level WHERE inside view
    -- bodies — so we have to recognize it explicitly here.
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    -- authenticated internal users (e.g. CRM operators logged in
    -- with a real Supabase Auth session): same path as the
    -- apply_clicks RLS policy.
    OR public.is_internal_user()
  GROUP BY partner, date_trunc('day', created_at);

REVOKE ALL ON public.partner_attribution_daily FROM PUBLIC;
GRANT SELECT ON public.partner_attribution_daily TO authenticated;

COMMENT ON VIEW public.partner_attribution_daily IS
  'Daily rollup of apply_clicks for the partner-attribution dashboard. Internal users only via the is_internal_user() gate inside the view body.';
