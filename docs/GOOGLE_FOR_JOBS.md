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

## What we can build next (next deploy cycle)

### Google Indexing API integration

From Google's spec: **"For job posting URLs, we recommend using the
Indexing API instead of sitemaps because the Indexing API prompts
Googlebot to crawl your page sooner."**

Without it: Google discovers new jobs via sitemap crawl, ~2–24h latency.
With it: ~1–15 minutes from job-create to Googlebot crawl.

For a job board where freshness matters (recruiters expect their post to
show up TODAY), this is the next biggest lever.

Implementation plan:
1. Create a Google Cloud project + service account
2. Verify service account as Site Owner in Search Console
3. Add `GOOGLE_SERVICE_ACCOUNT_JSON` env var in Vercel (the service
   account's private-key JSON)
4. New module `src/lib/google-indexing-api.ts`:
   - Sign JWT with RS256 using the service-account private key
   - Exchange for OAuth2 access token (cache 50 min)
   - POST to `https://indexing.googleapis.com/v3/urlNotifications:publish`
     with `{ url, type: 'URL_UPDATED' }` on every new job
5. Wire into:
   - `/post-job/verify/[token]/route.ts` after a job activates
   - `supabase/functions/refresh-ats-imports/index.ts` for ATS imports

Quota: Google's default is 200 URL notifications per day per project.
That covers /post-job submissions easily. For ATS-import bursts
(~30 new jobs per refresh cycle, ~6 cycles/day = ~180/day max) we're
just under the cap. Request a quota increase if needed — Google grants
publisher-program quota expansions free for JobPosting use cases.

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
