-- Seeded-jobs data quality cleanup
-- =================================
-- 2026-05-13
--
-- Background:
--   During Layer 2.1 salary-panel work we discovered that ~80 of the 425
--   seeded job rows have salary ranges, sign-on bonuses, and hiring-incentive
--   amounts bled into the `title`, `specialty`, and `role` text fields.
--   Examples:
--     specialty: "Interventional Pain Physician – $550K"
--     role:      "Cardiac Nurse - (RN - Step Down) - $12,400 Sign On Bonus"
--     role:      "RN ICU - $18,900 Hiring Incentives"
--
--   These violate `memory/feedback_candidate_pitch_rules.md`:
--     "No sign-on bonus disclosure in candidate-facing copy."
--
--   Display-side cleanup (`lib/clean-labels.ts:stripSalarySuffix()`) is
--   already shipped on the three highest-traffic public surfaces (state
--   hub, specialty hub, /jobs/[slug] including JobPosting JSON-LD). But
--   the dirty data still leaks via:
--     - /jobs (full list, jobs-filter.tsx)
--     - / (homepage if it lists jobs)
--     - /employers/[slug] per-employer hub
--     - XML feeds (jobs.xml, linkedin.xml, rss.xml, feed-builders.ts) —
--       these go to aggregator partners (Adzuna, ZipRecruiter, etc.), which
--       is the most consequential exposure for the sign-on-bonus violation
--     - Employer dashboard (auth-gated, lower urgency)
--
--   This migration is the durable fix at the source.
--
-- Row counts as of 2026-05-13:
--   total_active_jobs           : 425
--   specialty_bleed (has $)     :  39
--   role_bleed (has $)          :  79
--   title_bleed (has $)         :   0   (titles are already clean)
--   specialty bonus-phrase      :  19   (Sign On Bonus / Hiring Incentives)
--   role bonus-phrase           :  40
--   suspect salary_min < $20K   :  25   (these contain bonus amounts, not salaries)
--
-- DO NOT APPLY this migration as one giant transaction without a backup.
-- Run section-by-section after reviewing the WHERE clauses. Each section
-- is idempotent (running it twice produces the same result).

BEGIN;

-- Section 1 — Clean the `specialty` column.
-- Strips trailing " – $..." or " - $..." or " - Sign On Bonus..." patterns.
-- Conservative regex: only strips when the suffix contains `$` or a known
-- cue phrase. Plain hyphenated specialties ("Family Medicine - Outpatient")
-- are preserved.
UPDATE public_jobs
SET specialty = regexp_replace(
  specialty,
  '\s*[–-]\s*(\$|Up\s+to\s+\$|Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?).*$',
  '',
  'i'
)
WHERE status IN ('active', 'pending_review')
  AND deleted_at IS NULL
  AND specialty ~* '[\-–]\s*(\$|Up\s+to\s+\$|Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?)';

-- Section 2 — Clean the `role` column with the same regex.
UPDATE public_jobs
SET role = regexp_replace(
  role,
  '\s*[–-]\s*(\$|Up\s+to\s+\$|Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?).*$',
  '',
  'i'
)
WHERE status IN ('active', 'pending_review')
  AND deleted_at IS NULL
  AND role ~* '[\-–]\s*(\$|Up\s+to\s+\$|Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?)';

-- Section 3 — NULL out salary_min/salary_max where they contain bonus
-- amounts (sub-$20K values are almost always bonus dollars, not annual
-- salary). These rows will then display "Salary not disclosed" in the
-- public listings, which is honest — we don't know the real salary.
--
-- 25 rows affected per the 2026-05-13 audit.
UPDATE public_jobs
SET salary_min = NULL,
    salary_max = NULL
WHERE status IN ('active', 'pending_review')
  AND deleted_at IS NULL
  AND salary_min IS NOT NULL
  AND salary_min < 20000;

-- Section 4 — Verify counts after cleanup (sanity check).
-- Expected: all four counters should be 0 after the migration.
SELECT
  count(*) FILTER (WHERE specialty ~* '[\-–]\s*\$') AS remaining_specialty_bleed,
  count(*) FILTER (WHERE role ~* '[\-–]\s*\$') AS remaining_role_bleed,
  count(*) FILTER (WHERE specialty ~* 'Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?') AS remaining_specialty_bonus,
  count(*) FILTER (WHERE role ~* 'Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?') AS remaining_role_bonus,
  count(*) FILTER (WHERE salary_min IS NOT NULL AND salary_min < 20000) AS remaining_suspect_salary
FROM public_jobs
WHERE status IN ('active', 'pending_review')
  AND deleted_at IS NULL;

COMMIT;

-- Rollback note:
--   If a column needs to be restored, the original text values can be
--   recovered from Supabase point-in-time recovery (PITR) within the
--   retention window. There is no in-table backup of the pre-update
--   strings — the regex-strip is destructive on purpose. If you'd rather
--   keep the originals, add a `legacy_specialty` / `legacy_role` /
--   `legacy_salary_min` etc. column pattern BEFORE running this migration.
