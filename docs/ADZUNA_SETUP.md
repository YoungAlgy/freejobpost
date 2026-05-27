# Adzuna ingest — one-time setup

Date: 2026-05-27
Status: Scaffold deployed (`adzuna-ingest` edge function v1, no-op until vault has creds). Cron scheduled at `:37 */4 * * *`. **One step left:** drop the Adzuna app_id + app_key into Supabase vault.

## The two values

After registering at https://developer.adzuna.com/signup and confirming the email, you'll see:
- **app_id** — looks like `12345abc` (8 chars)
- **app_key** — looks like `abc123def456...` (32 chars)

Both are visible at https://developer.adzuna.com/admin/access_details after login.

## Adding them to Supabase vault

Run this in the SQL editor at https://supabase.com/dashboard/project/tsruqbodyrmxqzhvxret/sql/new (replace the placeholders with the real values):

```sql
SELECT vault.create_secret('<paste-app_id-here>',  'adzuna_app_id',  'Adzuna API app_id  — owner alex@avahealth.co');
SELECT vault.create_secret('<paste-app_key-here>', 'adzuna_app_key', 'Adzuna API app_key — owner alex@avahealth.co');
```

Then verify:
```sql
SELECT name, LEFT(decrypted_secret, 4) AS prefix, length(decrypted_secret) AS len
FROM vault.decrypted_secrets
WHERE name LIKE 'adzuna_%';
```

## How to test

Right after the SELECT statements succeed, fire the function manually to confirm it pulls jobs:

```sql
SELECT net.http_post(
  url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/adzuna-ingest',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;
```

Then check the response (within ~30 sec):
```sql
SELECT id, status_code, LEFT(content::text, 800) AS body
FROM net._http_response
WHERE id = (SELECT max(id) FROM net._http_response);
```

Expected first run: ~100 raw jobs across `healthcare-nursing-jobs` + `social-care-jobs` categories, ~70-80 inserted into `public_jobs` with `source = adzuna:healthcare-nursing-jobs` etc.

## Cron schedule

Once verified, the cron at `:37 */4 * * *` fires automatically every 4 hours. 6 ticks/day × 2 categories × 50 results = 600 jobs/day max from Adzuna. Well under their 1000 calls/day free-tier cap.

## Rolling back

If anything goes wrong:
```sql
-- Disable the cron temporarily
UPDATE cron.job SET active = false WHERE jobname = 'adzuna-ingest-every-4h';

-- Or fully remove
SELECT cron.unschedule('adzuna-ingest-every-4h');

-- Or drop the secrets so the function turns into a no-op
DELETE FROM vault.secrets WHERE name IN ('adzuna_app_id', 'adzuna_app_key');
```

## Two-way path (separate from this setup)

This setup is the **inbound** half — we ingest Adzuna's listings into our own DB. The **outbound** half (Adzuna ingests OUR /jobs.xml feed) is separate and was kicked off via the 2026-05-20 partner intake email to Bobbie Reynolds. Status currently: awaiting reply (she's on maternity leave per her 2026-05-19 auto-reply; team handles via facilities@adzuna.com).
