-- Backfill bot-flagging on historical apply_clicks rows.
--
-- The /click/[slug] route handler now skips the apply_clicks insert when the
-- caller's User-Agent matches our bot regex (see src/lib/bot-filter.ts), but
-- that only protects future inserts. As of 2026-05-26 the historical table is
-- ~99% bot traffic:
--
--   day        partner    bot      human  pct_bot
--   2026-05-26 internal   10,035   12     99.9%
--   2026-05-26 rss        6,275    0      100.0%
--   2026-05-21 internal   19       18     51.4%
--   2026-05-20 internal   31       21     59.6%
--
-- This migration:
--   1) Adds is_bot boolean column (default false — applies cleanly to future
--      inserts since the route filter already drops bot rows before they get
--      here)
--   2) Backfills is_bot on every existing row using the same regex shipped
--      in src/lib/bot-filter.ts. Postgres ~* is case-insensitive POSIX
--      regex; equivalent to JS /(pattern)/i
--   3) Replaces partner_attribution_daily with a WHERE is_bot = false
--      variant. Same column shape, same access guard. Numbers will drop
--      dramatically but become trustworthy.
--   4) Indexes is_bot to keep the view filter cheap as the table grows.
--
-- Forensic value of keeping the rows (vs DELETE): we can sample historical
-- bot UAs to tune the regex if false-positives surface, and we retain a
-- full audit trail. Storage cost of the extra column on ~17K rows is
-- negligible.

ALTER TABLE public.apply_clicks
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

UPDATE public.apply_clicks
SET is_bot = true
WHERE user_agent IS NULL
   OR user_agent ~* '(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|slack|skype|preview|fetch|monitor|uptime|pingdom|gtmetrix|lighthouse|headless|puppeteer|playwright|selenium|phantom|httrack|wget|curl|python-requests|python-urllib|go-http-client|java/|okhttp|apache-httpclient|libwww|axios/[0-9])';

CREATE INDEX IF NOT EXISTS apply_clicks_is_bot_partner_day_idx
  ON public.apply_clicks (is_bot, partner, created_at)
  WHERE is_bot = false;

CREATE OR REPLACE VIEW public.partner_attribution_daily AS
  SELECT
    partner,
    date_trunc('day'::text, created_at) AS day,
    count(*) AS click_count,
    count(DISTINCT job_slug) AS unique_jobs,
    count(DISTINCT ip_hash) AS unique_ips
  FROM public.apply_clicks
  WHERE (COALESCE(auth.jwt() ->> 'role'::text, ''::text) = 'service_role'::text OR is_internal_user())
    AND is_bot = false
  GROUP BY partner, date_trunc('day'::text, created_at);

-- Sanity-check (run after apply):
--   SELECT
--     date_trunc('day', created_at)::date AS day,
--     count(*) FILTER (WHERE is_bot)    AS bot_rows,
--     count(*) FILTER (WHERE NOT is_bot) AS human_rows
--   FROM apply_clicks
--   WHERE created_at >= now() - interval '14 days'
--   GROUP BY day ORDER BY day DESC;
--
-- Should match the pre-apply audit results within ±0% (deterministic regex).
