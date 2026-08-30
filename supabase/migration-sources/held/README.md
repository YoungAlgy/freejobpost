# Held migration sources

Files in this directory are review artifacts. They are outside
`supabase/migrations` and must not be applied by an automated migration run.

The legacy-retirement source records the intended shutdown of aggregate-job
processing and Ava candidate bridges. It preserves existing job, employer,
candidate, application, and match rows. Apply it only after the shared-project
inventory, backup, dependency, and rollback checks are complete.
