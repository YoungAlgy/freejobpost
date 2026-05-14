-- Allow verified_via = 'ats_import' on public_employers
-- Applied 2026-05-14 via Supabase MCP
-- Project ref: tsruqbodyrmxqzhvxret
-- ============================================================================
-- ATS-imported employers need a distinct verified_via so app code can filter
-- them out of the directory page, per-employer SEO pages, and the homepage
-- verified-employer count. They're legitimate but we don't have a verified
-- business relationship with them — we're just consuming their public board API.
--
-- Pair constraint (verified_at NULL <=> verified_via NULL) stays in place;
-- ATS imports must set verified_at = now() to satisfy it.

ALTER TABLE public.public_employers
  DROP CONSTRAINT IF EXISTS public_employers_verified_via_chk;

ALTER TABLE public.public_employers
  ADD CONSTRAINT public_employers_verified_via_chk
  CHECK (
    verified_via IS NULL
    OR verified_via = ANY (ARRAY[
      'domain_email',
      'manual_review',
      'ats_oauth',
      'ats_import',  -- NEW: curated public-board imports (Greenhouse/Lever)
      'seeded'
    ])
  );
