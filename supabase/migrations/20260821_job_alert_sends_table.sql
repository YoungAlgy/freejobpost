-- Phase 1 of untangling freejobpost/avahealth-crm's shared-DB coupling
-- (ahead of freejobpost's move to its own Supabase project).
--
-- job-alert-digest (supabase/functions/job-alert-digest/index.ts) has always
-- inserted its send log into avahealth-crm's `email_sends` table --
-- campaign_id and user_id are both CRM foreign keys (email_campaigns,
-- profiles), and every insert passes them as null, silently bypassing what
-- those FKs are meant to enforce. This table gives job-alert-digest its own
-- home instead of writing into a table it doesn't own.
--
-- Deliberately leaner than email_sends: no delivered_at/opened_at/bounced_at
-- columns, since resend-webhook (avahealth-crm) reconciles those by matching
-- resend_id against email_sends specifically, and wiring this table into that
-- shared webhook is its own follow-up, not bundled into this fix. A job alert
-- is a fire-and-forget notification, not a tracked campaign -- knowing it was
-- sent is enough; open/click/bounce analytics were never acted on here.

CREATE TABLE IF NOT EXISTS public.job_alert_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  body_preview TEXT,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_alert_sends_to_email ON public.job_alert_sends(to_email);
CREATE INDEX IF NOT EXISTS idx_job_alert_sends_resend_id ON public.job_alert_sends(resend_id);

ALTER TABLE public.job_alert_sends ENABLE ROW LEVEL SECURITY;

-- Service-role only (job-alert-digest runs with the service-role key, same
-- as every other cron-triggered send function in this repo). No anon/authenticated
-- access needed -- this is an internal send log, not user-facing data.
REVOKE ALL ON public.job_alert_sends FROM anon, authenticated;
