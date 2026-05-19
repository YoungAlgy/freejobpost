-- partner_attribution_daily: rollup of apply_clicks for the partner-
-- attribution dashboard (Layer 1D of the 2026-05-19 plan).
--
-- One row per (partner, day) with click_count, unique_jobs (distinct
-- job_slug touched that day), and unique_ips (distinct ip_hash — a noisy
-- proxy for unique people, since ip_hash is the truncated SHA-256 of the
-- client IP so two browsers behind the same NAT collapse to one).
--
-- Internal-only: reuses the is_internal_user() RLS pattern via a security
-- barrier — only internal users see rows. Anon / authenticated candidate-
-- side reads get nothing.
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
  WHERE public.is_internal_user()
  GROUP BY partner, date_trunc('day', created_at);

REVOKE ALL ON public.partner_attribution_daily FROM PUBLIC;
GRANT SELECT ON public.partner_attribution_daily TO authenticated;

COMMENT ON VIEW public.partner_attribution_daily IS
  'Daily rollup of apply_clicks for the partner-attribution dashboard. Internal users only via the is_internal_user() gate inside the view body.';
