# freejobpost — status, in flight, partner-program plan

For Ally — last updated 2026-05-20. Algy's draft; edit/send.

---

## Where we actually are

freejobpost.co has **8,961 active healthcare jobs** aggregated from real ATS APIs:

| Source | Jobs |
|---|---:|
| U.S. Federal Government (USAJobs) | 2,576 |
| AdventHealth | 1,534 |
| Cleveland Clinic | 1,466 |
| Mass General Brigham | 1,339 |
| Ava Health Partners (seeded) | 422 |
| Saint Luke's Healthcare | 331 |
| Lyra Health | 270 |
| OneMedical, Talkiatry, Headway, Stanford, Elevance, others | ~1,000 |

All indexed by Google. Sitemap is 9,328 URLs (up from 1,165 before the bug-fix push). JobPosting structured data on every detail page. Federal-agency × state SEO matrix at `/jobs/federal/[agency]/[state]` covering 58 verified-viable cells.

## What shipped this week

| | What | Live? |
|---|---|---|
| 1 | Per-partner apply-click attribution. Every Apply button routes through `/click/[slug]?p=<partner>` which logs the click and 302-redirects to the employer. | ✅ |
| 2 | 3,443 previously-404'd jobs unbroken (regex bug was rejecting 39% of inventory — all of MGB, Saint Luke's, Stanford, Elevance, 93% of AdventHealth). | ✅ |
| 3 | Sitemap 8× larger — 1,165 → 9,328 URLs. | ✅ |
| 4 | XML feeds actually refresh now (force-static + 1k row cap fix). Per-partner `/feeds/<partner>.xml` now serve full ~9k inventory, not the 425-job seeded set. | ✅ |
| 5 | `apply_clicks` table + `partner_attribution_daily` view — per-job, per-partner click data accruing as partners crawl. | ✅ |

## Partner submissions — sent today (2026-05-20)

Three publisher programs submitted via their verified intake forms:

| Partner | Feed URL submitted | Status |
|---|---|---|
| Talent.com | `freejobpost.co/jobs.xml?ref=talent` | ✅ Form submitted (talent.com/contact/employers). Confirmation: "Someone from our team will contact you shortly." |
| Adzuna | `freejobpost.co/jobs.xml?ref=adzuna` | ✅ Form submitted (adzuna.com/hire/contact). Confirmation: "We will get in touch with you shortly." |
| Jooble | `freejobpost.co/jobs.xml?ref=jooble` | ✅ Form submitted (jooble.org/partner/ppc). Confirmation: "Respond within one business day." |

Caveat from today: my first attempt was email to `partner@talent.com` / `partners@jooble.com` / `data@adzuna.com` — first two bounced, third hit a maternity-leave OOO. The verified path turned out to be the publisher-side forms on each company's site, not the email aliases I had on file. Found them, refilled, submitted. The bounced emails won't get re-tried.

**Indeed / LinkedIn / ZipRecruiter intentionally deferred**:
- Indeed killed free organic XML feeds in 2023 — paid only via Appcast / Pandologic / Joveo (~$1-3k/mo). Wait until the free 3 produce placement data to justify the spend.
- LinkedIn Limited Listings requires a paid Talent Solutions seat first.
- ZipRecruiter Publisher Program is quality-scored — apply after Talent.com confirms.

Expected timing:
- Jooble: ~24 hours (their stated SLA)
- Talent.com + Adzuna: 1-10 business days
- First measurable apply-click attribution from a partner: 2-4 weeks once they start crawling

## What's the actual moat

1. **Healthcare-only data filter.** Our regex-based job classifier is project-specific IP. Generalist boards can't replicate it cheaply.
2. **Federal × state SEO matrix.** 58 prerendered pages at `/jobs/federal/<agency>/<state>` covering keyword surface no generalist will copy because it's too narrow for them.
3. **Shared DB with freeresumepost.co.** The candidate side already cites our job data for salary aggregates ("RN salary in Florida, by state"). Two sides of the market, one source of truth.
4. **Per-partner attribution data.** As partners crawl, the `partner_attribution_daily` rollup accrues real per-source click numbers. When a hospital recruiter asks "what does freejobpost actually drive," we'll have a screenshot answer with verified data, not vibes. Generalists don't have per-job attribution at that granularity.

## On the ThunderJaws posting

I read their actual site, not just the pitch:
- `hire.thunderjaws.com` is a Lovable.app no-code template (their own structured data points to `hire-thunderjaws-com.lovable.app`)
- Their `/jobs.xml` 404s
- Their sitemap has 8 marketing pages and zero job listings
- Their `/api/jobs` returns the homepage HTML
- Their Upwork posting hires the freelancer to **build** the XML feed + partner-program onboarding they're **claiming to have in the same posting**

We're ahead on the build, did today the partner-submission work they're paying ~$2k+ on Upwork to outsource, and have actual aggregated inventory their site doesn't have.

---

Questions or pushback: catch me here.
