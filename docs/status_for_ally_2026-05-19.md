# freejobpost — status, in flight, partner-program plan

For Ally — 2026-05-19. Algy's draft; edit/send.

---

## Where we actually are

freejobpost.co has **8,752 active healthcare jobs** aggregated from real ATS APIs:

| Source | Jobs |
|---|---:|
| U.S. Federal Government (USAJobs) | 2,576 |
| AdventHealth | 1,534 |
| Cleveland Clinic | 1,466 |
| Mass General Brigham | 1,339 |
| Ava Health Partners (seeded) | 422 |
| Saint Luke's Healthcare | 331 |
| Lyra Health | 270 |
| OneMedical, Talkiatry, Headway, Stanford, Elevance, others | ~810 |

All indexed by Google (89 indexed pages + 9,079 in the sitemap waiting on the next crawl). JobPosting structured data on every detail page. Federal-agency × state SEO matrix at `/jobs/federal/[agency]/[state]` covering 58 verified-viable cells.

## What ships this week

Four fixes are queued locally and will go live on the next push:

1. **Per-partner apply-click attribution.** Every Apply button now routes through `/click/[slug]?p=<partner>` which logs the click and 302-redirects to the employer's apply page. This is what publisher programs (Indeed, Talent.com, etc.) require as proof we can deliver verifiable traffic.
2. **3,443 jobs unbroken.** A regex bug was 404ing 39% of inventory (all of Mass General Brigham, Saint Luke's, Stanford, Elevance, 93% of AdventHealth) when clicked from the listing. Fixed.
3. **Sitemap 9x larger.** Same root-cause silently capped the sitemap at 1,165 URLs of ~9,000. Google's been missing 88% of our indexable pages. Now lists 9,079.
4. **XML feeds actually refresh.** The 8 per-partner feeds + the main `/jobs.xml` were frozen at build time. Now refresh hourly with full inventory.

## What's the actual moat

1. **Healthcare-only filter.** Our regex-based job classifier is project-specific IP. Generalist boards can't replicate it cheaply.
2. **Federal × state SEO matrix.** 58 prerendered pages at `/jobs/federal/<agency>/<state>` covering keyword surface no generalist will copy because it's too narrow for them.
3. **Shared DB with freeresumepost.co.** The candidate side already cites our job data for salary aggregates ("RN salary in Florida, by state"). Two sides of the market, one source of truth.
4. **Per-partner attribution data.** Once partners go live (next 1-2 weeks), we can tell employers "we drove X verified Apply clicks to your reqs from source Y." Generalists don't have per-job attribution at that granularity.

## Partner-program plan (the ThunderJaws-equivalent work)

I'm submitting to the volume-friendly publishers this week. Each is a 5-10 minute web form:

| Partner | Status | Feed URL |
|---|---|---|
| Talent.com | Applied (awaiting reply) | `freejobpost.co/jobs.xml?ref=talent` |
| Adzuna | Submitting | `freejobpost.co/jobs.xml?ref=adzuna` |
| Jooble | Submitting | `freejobpost.co/jobs.xml?ref=jooble` |
| Glassdoor | Submitting | `freejobpost.co/jobs.xml?ref=glassdoor` |
| Careerjet | Deferred (needs dedicated feed route) | n/a yet |

Indeed / LinkedIn / ZipRecruiter intentionally deferred:
- Indeed killed free organic XML feeds in 2023 — entry now requires Appcast or Pandologic spend (~$1-3k minimum). I'd rather earn placement data on the free partners first, then justify the spend.
- LinkedIn Limited Listings requires a paid Talent Solutions seat as prerequisite.
- ZipRecruiter Publisher Program is quality-scored — we hit it after Talent.com confirms.

Expected timing: first partner confirmation within 1-2 weeks (Talent.com is fastest historically). First measurable apply-click attribution from a partner within 2-4 weeks.

## On the ThunderJaws posting

I read their actual site, not just the pitch:
- `hire.thunderjaws.com` is a Lovable.app no-code template (their own structured data points to `hire-thunderjaws-com.lovable.app`)
- Their `/jobs.xml` 404s
- Their sitemap has 8 marketing pages and zero job listings
- Their `/api/jobs` returns the homepage HTML
- Their Upwork posting hires the freelancer to **build** the XML feed + partner-program onboarding they're **claiming to have in the same posting**

We're ahead on the build, behind on partner submissions, and doing the partner work ourselves rather than paying it out.

---

Questions or pushback: catch me here.
