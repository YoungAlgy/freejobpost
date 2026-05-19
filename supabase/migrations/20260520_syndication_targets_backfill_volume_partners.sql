-- One-shot backfill: opt every active job into the volume-friendly partner
-- subset that tolerates large feeds and does its own dedup. The strict
-- partners (Indeed, LinkedIn, ZipRecruiter) are intentionally NOT in the
-- auto-opt-in set — they're employer-explicit only, gated per-job by
-- whoever owns the listing.
--
-- Before: 422 Ava-seeded jobs have full syndication_targets arrays; 8,328
-- ATS-imported jobs have empty arrays so they're invisible to /feeds/*.xml.
-- After: every active job opts into the volume-friendly subset, making
-- /feeds/talent.xml et al. real publisher feeds covering full inventory.
--
-- Idempotent: only touches rows whose current syndication_targets is empty
-- (or NULL via array-length-coalesce). Re-running is a no-op.
--
-- WHEN TO APPLY: only after the 4 freejobpost commits land in prod (the
-- /feeds/* routes need the feed-builders 9-batch fix or they'll only serve
-- 1,000 of the newly-opted-in 9,000). Otherwise the backfill is "real" but
-- the feeds still under-serve.

-- Careerjet intentionally omitted from this list — there's no
-- /feeds/careerjet.xml route yet (would require adding 'careerjet' to the
-- SyndicationTargetId type union + SYNDICATION_TARGETS array + the test).
-- Add when the Careerjet partner channel is ready.
UPDATE public.public_jobs
   SET syndication_targets = ARRAY['talent','adzuna','jooble','glassdoor','rss','google']::text[]
 WHERE status = 'active'
   AND deleted_at IS NULL
   AND expires_at > now()
   AND COALESCE(array_length(syndication_targets, 1), 0) = 0;
