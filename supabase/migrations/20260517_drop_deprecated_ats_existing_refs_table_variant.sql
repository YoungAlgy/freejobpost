-- Drop the TABLE-returning get_ats_existing_refs variant. v15 of
-- refresh-ats-imports (deployed 2026-05-17 ~14:24 UTC) switched to the
-- jsonb-returning variant, and the 16:17 UTC auto-cron tick fired cleanly
-- after that switch — confirming the jsonb path is stable. The TABLE
-- variant has no remaining callers.

DROP FUNCTION IF EXISTS public.get_ats_existing_refs(text);
