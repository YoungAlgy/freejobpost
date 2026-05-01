-- Phase 0 — verified-employer foundation.
--
-- Background discovered during application:
--   `public_employers_directory` is a VIEW (created in avahealth-crm
--   migration 20260426130000_marketplace_hardening.sql) over the underlying
--   `public_employers` table. The base table already has `verified_at`
--   (timestamptz) defined since 20260424100000_freejobpost_schema.sql.
--
-- This migration:
--   1. Adds `verified_via` (text) to the underlying public_employers table
--   2. Recreates the public_employers_directory view to expose verified_via
--   3. Adds a CHECK constraint on verified_via values
--   4. Adds a co-consistency check (verified_at <-> verified_via must agree)
--   5. Partial index on verified_at for "show me verified employers" queries
--
-- Phase 1 will introduce a green-check badge in the listing UI once we have
-- something real to verify. Until then this is foundation only.
--
-- Safe to re-run; uses IF NOT EXISTS guards.

BEGIN;

-- 1. Add verified_via column on the base table (verified_at already exists)
ALTER TABLE public.public_employers
  ADD COLUMN IF NOT EXISTS verified_via text;

-- 2. Backfill: any employer that already had verified_at set (pre-Phase-0)
--    came in through manual review by Algy / Ava. Tag them so the
--    pair-consistency CHECK in step 4 can be added without violation.
UPDATE public.public_employers
   SET verified_via = 'manual_review'
 WHERE verified_at IS NOT NULL
   AND verified_via IS NULL;

-- 3. CHECK constraint on verified_via — small enum-as-text set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'public_employers_verified_via_chk'
  ) THEN
    ALTER TABLE public.public_employers
      ADD CONSTRAINT public_employers_verified_via_chk
      CHECK (
        verified_via IS NULL
        OR verified_via = ANY (
          ARRAY[
            'domain_email',  -- emailed a token to an address at the employer's domain and the recipient clicked through
            'manual_review', -- Algy / Ava confirmed the employer manually after a phone or LinkedIn check
            'ats_oauth',     -- employer connected via Greenhouse / Lever OAuth
            'seeded'         -- Ava-placed roles; documents that the employer is the staffing firm itself
          ]
        )
      );
  END IF;
END $$;

-- 4. Co-consistency: if verified_via is set, verified_at must be set too
--    (and vice-versa). One without the other is meaningless.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'public_employers_verified_pair_chk'
  ) THEN
    ALTER TABLE public.public_employers
      ADD CONSTRAINT public_employers_verified_pair_chk
      CHECK ((verified_at IS NULL) = (verified_via IS NULL));
  END IF;
END $$;

-- 4. Partial index on verified_at — most queries that care about verified
--    status will be "show me verified employers"; partial index keeps cost low.
CREATE INDEX IF NOT EXISTS idx_public_employers_verified
  ON public.public_employers (verified_at DESC)
  WHERE verified_at IS NOT NULL;

-- 5. Recreate the directory view to expose verified_via.
--    Mirrors the projection from 20260426130000_marketplace_hardening.sql,
--    with verified_via appended at the end (CREATE OR REPLACE VIEW
--    cannot reorder existing columns — new ones must come last).
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
  verified_via
FROM public.public_employers
WHERE status = 'active'
  AND deleted_at IS NULL
  AND verified_healthcare_org = true;

COMMENT ON VIEW public.public_employers_directory IS
  'Anon-safe projection of verified-active employers. Excludes contact email/phone/name, user_id, verification_notes. Used by freejobpost.co jobs.xml feed and homepage to attribute jobs to real company names. Phase 0 (2026-04-30) added verified_via for badge UI in Phase 1.';

GRANT SELECT ON public.public_employers_directory TO anon, authenticated;

COMMIT;

-- Verification queries (uncomment to run after migration):
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'public_employers'
--   AND column_name IN ('verified_at', 'verified_via');
-- SELECT COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified
--      , COUNT(*) AS total
--   FROM public.public_employers;
