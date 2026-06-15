-- Backfill migration for public_jobs.description_usable_chars.
--
-- This STORED generated column + its partial index were added to the live DB
-- in early June 2026 to let feed/sitemap queries filter on description length
-- at the database instead of post-fetch in JS, but were never captured in a
-- migration file. This backfills that. It is idempotent (IF NOT EXISTS) so it
-- is a no-op against the live DB where these objects already exist, and it
-- reproduces them on a fresh DB or a Supabase branch.
--
-- The column is the HTML-stripped, whitespace-collapsed, trimmed visible-char
-- count of the description. It is the DB-side mirror of hasUsableDescription()
-- in src/lib/feed-builders.ts (the strip is byte-identical: strip <...> tags to
-- a space, collapse runs of whitespace to one space, trim, count). Keeping the
-- two in sync is what lets the /jobs/[slug] noindex gate (runtime function), the
-- JobPosting JSON-LD gate (runtime function), and the sitemap (this column) all
-- gate at MIN_INDEXABLE_DESCRIPTION_CHARS (250) without ever disagreeing.
--
-- WARNING: do not change this expression without changing hasUsableDescription()
-- to match, and vice versa. A drift means the sitemap could list a URL the page
-- noindexes (or omit one it indexes).

ALTER TABLE public.public_jobs
  ADD COLUMN IF NOT EXISTS description_usable_chars integer
  GENERATED ALWAYS AS (
    char_length(
      btrim(
        regexp_replace(
          regexp_replace(COALESCE(description, ''::text), '<[^>]+>'::text, ' '::text, 'g'::text),
          '\s+'::text, ' '::text, 'g'::text
        )
      )
    )
  ) STORED;

-- Partial index powering the active-jobs feed + sitemap scans. The 250 floor
-- baked into the WHERE clause matches MIN_INDEXABLE_DESCRIPTION_CHARS (the page
-- + sitemap indexability bar). (updated_at DESC, id DESC) is the feed sort order
-- so the index serves the ORDER BY too. NOTE: the 600 partner-feed bar
-- (MIN_DESCRIPTION_CHARS) is applied on top of this index at query time; this
-- partial index intentionally covers the wider 250+ set so it serves both the
-- 250 (page/sitemap/reader-feed) and 600 (partner-feed) consumers.
CREATE INDEX IF NOT EXISTS idx_public_jobs_active_usable_desc
  ON public.public_jobs USING btree (updated_at DESC, id DESC)
  WHERE ((status = 'active'::text) AND (deleted_at IS NULL) AND (description_usable_chars >= 250));
