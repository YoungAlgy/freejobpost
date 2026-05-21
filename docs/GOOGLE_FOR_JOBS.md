# Getting freejobpost.co listed in Google for Jobs

Boss-facing summary: what we shipped, what Algy needs to do after push, and
what we can build next to accelerate it.

## TL;DR — there's no "submit to Google for Jobs" form

Google for Jobs is not a syndication partner you apply to. It's a SERP feature
that lights up automatically when Google's normal crawl finds **valid
JobPosting JSON-LD on a per-job page that meets eligibility**. No human at
Google reviews submissions. The whole thing is markup + crawl + validation.

This is good news: we don't have to wait for an approval. As soon as Google
re-crawls our pages with the markup we just shipped, listings start
appearing — usually within 1–14 days.

## What we shipped (already in this push)

**Every `/jobs/[slug]` page emits a JobPosting JSON-LD block** that passes
Google's required + recommended property list:

| Property                          | Status      | Source                       |
|-----------------------------------|-------------|------------------------------|
| `title`                           | required ✓  | job.title (salary-stripped)  |
| `description`                     | required ✓  | job.description (≥50 chars)  |
| `datePosted`                      | required ✓  | job.created_at               |
| `hiringOrganization`              | required ✓  | resolved employer            |
| `jobLocation` (onsite/hybrid)     | required ✓  | city + state + country US    |
| `jobLocationType: TELECOMMUTE`    | required ✓  | remote roles                 |
| `applicantLocationRequirements`   | recommended ✓ | remote roles, Country: USA |
| `validThrough`                    | recommended ✓ | job.expires_at              |
| `identifier`                      | recommended ✓ | job.slug                    |
| `employmentType`                  | recommended ✓ | FULL_TIME / PART_TIME / etc.|
| `baseSalary`                      | recommended ✓ | when salary_min/max set     |
| `directApply: false`              | recommended ✓ | always                      |
| `experienceRequirements`          | recommended (beta) ✓ | numeric-prefix only |
| `educationRequirements`           | recommended (beta) ✗ | data not captured yet |

**Defensive guards we added:**

1. JobPosting is **suppressed** when the description is empty / <50 chars
   post-HTML-strip. Google rejects thin descriptions for the whole site,
   not just the affected job — better to omit than ship invalid markup.
2. JobPosting is **suppressed** when the recruiter explicitly opted out
   of Google syndication via the post-job form. Empty-array `syndication_targets`
   counts as "include in Google" (no preference = default opt-in).
3. JobPosting is **never** emitted on hub/listing pages (`/jobs`,
   `/specialty/[slug]`, `/state/[slug]`, etc.) — Google rejects markup on
   pages that don't represent a single job.

## What Algy needs to do AFTER push (one-time setup)

### 1. Submit `/sitemap.xml` to Google Search Console

This is the only manual step. Without it, Google has no automated signal
that ~9,700 per-job pages exist.

- Sign in to https://search.google.com/search-console
- Add the property `freejobpost.co` if not already added
- Verify ownership (DNS TXT or HTML file — the static-meta verification
  tag `google2d8a11e538afb900.html` is already deployed in `/public`)
- Sidebar → **Sitemaps** → enter `sitemap.xml` → **Submit**

Expected outcome: Google starts crawling the per-job URLs within 24h.
First listings appear in Google for Jobs within 1–14 days.

### 2. Validate one real job with Google's Rich Results Test

- Open https://search.google.com/test/rich-results
- Paste a per-job URL, e.g. `https://freejobpost.co/jobs/<any-slug-with-description>`
- Expected: **JobPosting (1 item detected) — 0 errors / 0 warnings**

If it shows errors, Algy posts the error message in our shared channel
and we fix it before more jobs pile up in the bad-markup state.

### 3. Monitor in Search Console

After 7 days, Search Console → **Enhancements → Job postings** will show:
- Total valid JobPostings indexed
- Any errors or warnings per-job
- The error breakdown is the punch-list for follow-up fixes

## Google Indexing API — code SHIPPED, Algy needs 1-time GCP setup

From Google's spec: **"For job posting URLs, we recommend using the
Indexing API instead of sitemaps because the Indexing API prompts
Googlebot to crawl your page sooner."**

Without it: Google discovers new jobs via sitemap crawl, ~2–24h latency.
With it: ~1–15 minutes from job-create to Googlebot crawl.

### What we shipped in code (commit `2bc6587`)

- `src/lib/google-indexing-api.ts`: full OAuth2 JWT-bearer client with
  in-process token cache. No new npm dependency — uses Node's built-in
  crypto module.
- Wired into `/post-job/verify/[token]/page.tsx`: every newly-verified
  job already fires a Google Indexing API notification alongside the
  existing IndexNow ping (Bing/Yandex/etc).
- **Activation gate**: when `GOOGLE_SERVICE_ACCOUNT_JSON` env var is
  unset, every call is a fast no-op. The integration is safe to ship
  pre-setup; activates automatically the moment the env var lands.

### What Algy does AFTER push (one-time, ~10 minutes)

1. **Create a Google Cloud project** (https://console.cloud.google.com)
   if you don't already have one for freejobpost.
2. **Enable the "Web Search Indexing API"** on that project.
   APIs & Services → Library → search "Indexing API" → Enable.
3. **Create a service account** under IAM & Admin → Service Accounts.
   Name it `freejobpost-indexing-bot` or similar. No special roles
   needed inside the GCP project (the API permission comes from Search
   Console, not GCP IAM).
4. **Generate a JSON key** for that service account. Keys tab → Add key
   → Create new key → JSON. The file downloads automatically — treat it
   like a password.
5. **In Google Search Console** (https://search.google.com/search-console):
   - Select the freejobpost.co property
   - Settings → Users and permissions → Add user
   - Paste the service-account `client_email` from the JSON file
   - Role: **Owner** (Indexing API requires Owner, not just Full)
6. **In Vercel** (project settings → Environment Variables):
   - Add `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: paste the FULL JSON-key file contents in one line. Vercel
     handles the newline-escaping correctly.
   - Apply to: Production (and Preview if you want to test it there)
   - Redeploy to pick up the new env var

After step 6: every new /post-job submission will ping the Indexing API
on verify. Verify by watching the Vercel function logs — successful
calls log nothing, errors log a `[google-indexing] …` warning line.

### Quota

Google's default is 200 URL notifications per project per day. That
covers /post-job submissions easily. ATS-import bursts (~30 jobs ×
~6 cycles = ~180/day max) come close — if we hit the cap, the
fire-and-forget integration just drops the extras gracefully and we
request a quota lift (free, routinely granted for JobPosting).

### educationRequirements (beta)

When we capture `education_level` on the post-job form (we don't yet),
add to the JobPosting payload:

```ts
educationRequirements: {
  '@type': 'EducationalOccupationalCredential',
  credentialCategory: job.education_level, // 'associate degree' | 'bachelor degree' | ...
}
```

This is BETA per Google's docs so the impact is uncertain, but it's
zero-cost to ship once we collect the data.

### Description backfill for ATS-imported jobs

2,300 of our 9,700 active jobs have empty descriptions because of the
Workday shallow-refresh bug (tracked as task #14). Each backfilled
description is one more JobPosting eligible for Google for Jobs.
Estimated: +24% to indexable inventory.

## What we are NOT doing — and why

- **Paying for Google for Jobs placement**: not a thing. The feature is
  free and entirely markup-driven. Anyone selling "Google for Jobs
  premium placement" is selling air.
- **Building a Job Indexing dashboard** that mirrors Search Console.
  Search Console already does this; rebuilding it inside our admin
  surface is wasted effort.
- **Removing the thin-description filter** to surface more JobPostings.
  Google penalizes the whole feed for invalid entries; quality > volume
  here. The description-backfill task above is the right path.

---

References:
- developers.google.com/search/docs/appearance/structured-data/job-posting
- developers.google.com/search/apis/indexing-api/v3/quickstart
- support.google.com/webmasters/answer/9012289 (job-posting policy)
