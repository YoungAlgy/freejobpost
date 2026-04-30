# Syndication submission status

**Last updated:** 2026-04-30 (after audit of yesterday's bounces)

## Current state per network

| Network | Status | What's actually happening |
|---|---|---|
| **Indeed** | ✅ Passive auto-crawl | Indeed retired public XML feed onboarding. Their crawler picks up `JobPosting` JSON-LD on `/jobs/[slug]` automatically. |
| **Glassdoor** | ✅ Passive (Indeed-owned, same pipeline) | No submission needed. |
| **Google for Jobs** | ✅ Passive | JSON-LD on `/jobs/[slug]` + sitemap submitted to GSC (verified 2026-04-29). |
| **Bing / Yahoo / DuckDuckGo** | ✅ Indexed | Bing WMT verified via GSC import (2026-04-29). 503 URLs already crawled. |
| **RSS** | ✅ Passive auto-discover | `<link rel="alternate">` + robots.txt declaration. |
| **Adzuna** | 🟢 **In active conversation** | Sent 2026-04-29 to `content@adzuna.com` cc `support@adzuna.com`. Matt Woodbridge (Product Manager) replied 2026-04-30 with qualification questions. Algy sent qualification answer 2026-04-30 5:05 PM ET. **Awaiting Matt's review of the feed.** |
| **Jooble** | ❌ Email bounced — needs new channel | `partners@jooble.com` returned 550 5.1.1 (address doesn't exist). **Action: book a call** at https://uk.jooble.org/partner/for-publishers (Calendly-style "Book a call" CTA on their for-publishers page). Algy picks a slot. |
| **ZipRecruiter** | ❌ Email bounced — needs new channel | `partners@ziprecruiter.com` returned 550 5.1.1. **Action: signup** at https://www.ziprecruiter.com/publishers — requires Publisher account creation, then add the feed URL via their dashboard. |
| **Talent.com** | ❌ Email bounced — needs new channel | `partner@talent.com` returned "address not found." **Action: signup** at https://www.talent.com/publishers — requires Publisher account creation (we knew this yesterday but tried email first). |
| **LinkedIn** | 🔒 Gated | Job Wrapping requires Talent Solutions rep + freejobpost.co Company Page (✅ created 2026-04-29 at linkedin.com/company/freejobpost id 113224630). Algy contacts his LinkedIn Recruiter rep when ready. |

## Why 3 of 4 emails bounced

Yesterday's email drafts used the addresses documented in `feeds/page.tsx:17-27` — but those addresses are stale across the industry. Each of those programs has migrated from informal email intake to either:
- Self-serve signup forms (ZipRecruiter, Talent.com)
- Scheduled sales calls (Jooble)

This is consistent with the broader industry pattern of partner programs gating intake to filter low-quality inbound. **The `feeds/page.tsx` SUBMIT_TO map needs another correction pass.**

## Adzuna conversation status

**Sent 2026-04-29 11:04 PM ET** → Matt Woodbridge replied 2026-04-30 12:22 PM ET with:

> Could you please confirm as a first step what the relationship is between your job board and the company https://www.avahealth.co/ and where/how do you source the jobs listed on your board?

**Sent qualification answer 2026-04-30 5:05 PM ET** confirming:
1. freejobpost.co is operated by Ava Health Partners LLC (parent), based in St. Petersburg, FL
2. Two-track sourcing: direct employer signup (primary) + Ava's own placements ("Seeded Roles")
3. No scraping; every listing has direct employer relationship + JobPosting JSON-LD landing page; 15-min TTL on removed listings
4. ~425 active US healthcare roles
5. Feed URL: https://freejobpost.co/feeds/adzuna.xml

**Expected response:** approval (24-72h) OR one more clarifying question.

## What Algy needs to do (when ready)

| Task | Time | Where |
|---|---|---|
| **Watch Adzuna inbox** | passive | alex@avahealth.co inbox, thread "Re: Healthcare jobs feed for Adzuna ingestion" |
| **Book Jooble call** | 5 min | https://uk.jooble.org/partner/for-publishers → "Book a call" |
| **Sign up Talent.com Publisher** | 5-10 min | https://www.talent.com/publishers (create account) |
| **Sign up ZipRecruiter Publisher** | 5-10 min | https://www.ziprecruiter.com/publishers |
| **LinkedIn Job Wrapping** | when rep contact available | Email LinkedIn Talent Solutions rep with feed URL |
| **Update feeds/page.tsx playbook** | 5 min code | Replace the SUBMIT_TO map in `src/app/feeds/page.tsx:17-27` with this doc's current paths. (Doc-only change; partner-facing internal page.) |

## Memory correction

Yesterday's session memory said "4 partner emails SENT (Adzuna/Jooble/ZipRecruiter/Talent)" — true that the messages were *sent from* alex@avahealth.co, but only 1 actually delivered. The bounce notifications arrived within seconds but went unnoticed until the 2026-04-30 inbox audit. session_20260429_freeapps_daytime.md has been updated to reflect this.
