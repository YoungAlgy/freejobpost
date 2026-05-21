-- Add 'careerjet' to syndication_targets for all active jobs that have the
-- volume-partner default set. The 2026-05-20 backfill intentionally
-- excluded 'careerjet' because no /feeds/careerjet.xml route existed yet
-- (commit b812064). That route ships in this same wave (today), and
-- 'careerjet' is now a member of the SyndicationTargetId union, has an
-- entry in SYNDICATION_TARGETS, and passes the test invariants. Reopt all
-- volume-eligible rows into Careerjet now that the feed is live.

UPDATE public.public_jobs
   SET syndication_targets = array_append(syndication_targets, 'careerjet')
 WHERE status = 'active'
   AND deleted_at IS NULL
   AND expires_at > now()
   AND 'talent' = ANY(syndication_targets)  -- proxy: same rows we backfilled into the volume partners
   AND NOT ('careerjet' = ANY(syndication_targets));
