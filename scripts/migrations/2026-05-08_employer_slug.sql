-- Phase 1 — per-employer SEO landing pages.
--
-- Adds a `slug` column to `public_employers` so each employer gets a
-- canonical URL on freejobpost.co (/employers/<slug>). Slugs are generated
-- from company_name using the same slugify() logic as the app-side helper
-- in src/lib/public-jobs.ts. A BEFORE INSERT trigger auto-fills the slug
-- for new employers so the app never has to set it manually.
--
-- This migration also recreates public_employers_directory to expose slug,
-- so the /employers/[slug] Next.js page can do a single query to resolve
-- employer by slug.
--
-- Safe to re-run; uses IF NOT EXISTS guards and CREATE OR REPLACE.

BEGIN;

-- 1. Helper: slugify a company name (mirrors app-side slugify())
CREATE OR REPLACE FUNCTION public.slugify_employer_name(name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT regexp_replace(
    regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
    '^-+|-+$',
    '',
    'g'
  );
$$;

-- 2. Add slug column (nullable first so we can backfill before constraining)
ALTER TABLE public.public_employers
  ADD COLUMN IF NOT EXISTS slug text;

-- 3. Backfill existing rows in creation-time order (oldest first) so the
--    first-registered employer with a given name keeps the clean slug.
--    Collisions get a numeric suffix: "mercy-health", "mercy-health-2", etc.
DO $$
DECLARE
  r            RECORD;
  base_slug    text;
  candidate    text;
  counter      int;
BEGIN
  FOR r IN
    SELECT id, company_name
    FROM   public.public_employers
    WHERE  slug IS NULL
    ORDER  BY created_at
  LOOP
    base_slug := public.slugify_employer_name(r.company_name);
    candidate := base_slug;
    counter   := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.public_employers
      WHERE  slug = candidate AND id <> r.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter   := counter + 1;
    END LOOP;
    UPDATE public.public_employers SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Make slug non-nullable and unique
ALTER TABLE public.public_employers
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_employers_slug
  ON public.public_employers (slug);

-- 5. Trigger: auto-fill slug on INSERT when caller doesn't supply one.
--    Handles collision the same way as the backfill above.
CREATE OR REPLACE FUNCTION public.auto_slug_employer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate text;
  counter   int;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := public.slugify_employer_name(NEW.company_name);
    candidate := base_slug;
    counter   := 2;
    WHILE EXISTS (
      SELECT 1 FROM public.public_employers
      WHERE  slug = candidate AND id <> NEW.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter   := counter + 1;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_slug_employer ON public.public_employers;
CREATE TRIGGER trg_auto_slug_employer
  BEFORE INSERT ON public.public_employers
  FOR EACH ROW EXECUTE FUNCTION public.auto_slug_employer();

-- 6. Recreate the directory view to expose slug.
--    Adds slug as the last column (CREATE OR REPLACE VIEW cannot reorder
--    existing columns; new ones must come last).
CREATE OR REPLACE VIEW public.public_employers_directory
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  company_name,
  company_url,
  vertical,
  verified_at,
  tier,
  created_at,
  verified_via,
  slug
FROM public.public_employers
WHERE status             = 'active'
  AND deleted_at         IS NULL
  AND verified_healthcare_org = true;

COMMENT ON VIEW public.public_employers_directory IS
  'Anon-safe projection of verified-active employers. Excludes contact email/phone/name, user_id, verification_notes. '
  'Used by freejobpost.co jobs.xml feed, homepage, /jobs listing, and /employers/[slug] SEO pages. '
  'Phase 0 (2026-04-30): added verified_via for badge UI. '
  'Phase 1 (2026-05-08): added slug for per-employer landing pages.';

GRANT SELECT ON public.public_employers_directory TO anon, authenticated;

COMMIT;

-- Verification queries (uncomment after running):
-- SELECT id, company_name, slug FROM public.public_employers ORDER BY created_at LIMIT 10;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'public_employers'
--   AND column_name = 'slug';
-- SELECT count(*) FROM public.public_employers WHERE slug IS NULL;  -- should be 0
