# Held migration sources

Files in this directory are review artifacts. They are outside
`supabase/migrations` and must not be applied by an automated migration run.

The legacy-retirement source records the intended shutdown of aggregate-job
processing and Ava candidate bridges. It preserves existing job, employer,
candidate, application, and match rows. Apply it only after the shared-project
inventory, backup, dependency, and rollback checks are complete.

The FreeJobPost submission boundary uses two held sources for a rolling
release. Apply `20260830230000_freejobpost_submission_boundary.sql` first. It
adds the standalone RPC and leaves the old Worker's grants in place. Deploy and
verify the new Worker at 100 percent, then wait for old requests to drain.
Keep the prior-Worker rollback window open during the production watch. Only
after that window is explicitly closed may
`20260830231500_freejobpost_retire_legacy_submission_grants.sql` remove public
access to the two legacy RPCs. Never merge those stages.
