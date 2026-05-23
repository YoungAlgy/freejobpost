# Syndication submission status

**Last updated:** 2026-05-22 (post-Jooble feed-quality reply)

## Current state per network

| Network | Status | What's actually happening |
|---|---|---|
| **Indeed** | ✅ Passive auto-crawl | Indeed retired public XML feed onboarding. Their crawler picks up `JobPosting` JSON-LD on `/jobs/[slug]` automatically. |
| **Glassdoor** | ✅ Passive (Indeed-owned, same pipeline) | No submission needed. |
| **Google for Jobs** | ✅ Passive | JSON-LD on `/jobs/[slug]` + sitemap submitted to GSC. |
| **Bing / Yahoo / DuckDuckGo** | ✅ Indexed | Bing WMT verified via GSC import. |
| **RSS** | ✅ Passive auto-discover | `<link rel="alternate">` + robots.txt declaration. |
| **Jooble** | 🟡 **In review — replied to feed-quality feedback 2026-05-22** | Ticket #1774316. Olha B (Customer Support) approved feed receipt 2026-05-21, flagged thin descriptions 2026-05-22 12:31 UTC, we shipped MIN_DESCRIPTION_CHARS 50→250 (commit `690d48c`) + replied same day. Awaiting next review pass. |
| **Adzuna** | 🟡 **In progress, slow channel** | sales@info.adzuna.com auto-confirmed 2026-05-20. Original contact bobbie@adzuna.com on maternity leave — alt contact `facilities@adzuna.com` per her auto-reply. Algy may need to nudge if no human reply in ~5 days. |
| **Careerjet** | ✅ Added as 4th partner channel 2026-05-20 | Feed live at `/feeds/careerjet.xml`. Reach claim: ~20M monthly searches across 90+ countries. |
| **ZipRecruiter** | ⚠️ Self-serve signup required | Original `partners@ziprecruiter.com` bounced. Public publisher intake at https://www.ziprecruiter.com/publishers requires Cloudflare-protected form (can't be driven via Chrome MCP). Deferred — passive Indeed crawl already covers most overlap. |
| **Talent.com** | ❌ No working channel | Both `partner@talent.com` and `partners@talent.com` bounced. **No public email intake.** Self-serve at https://www.talent.com/publishers is invite-only — would need LinkedIn outreach to a Talent.com employee. Deferred — lowest-volume of the partner candidates. |
| **LinkedIn** | 🔒 Gated | Job Wrapping requires Talent Solutions rep + freejobpost.co Company Page (created 2026-04-29 at linkedin.com/company/freejobpost). Algy contacts his LinkedIn Recruiter rep when ready. |

## Thin-description filter

`/jobs.xml` (and every per-partner feed via `hasUsableDescription()`) now drops jobs with <250 chars of plain text after HTML strip. This was 50 chars pre-2026-05-22. Jooble's review of the 50-char version flagged it as too lenient; the 250-char version represents a real description (responsibilities + requirements, not just a one-liner). On-site `/jobs` browse is unaffected — only partner XML feeds filter.

## Next action

Wait for Jooble's response to the 5/22 reply. If they re-confirm the feed is publish-ready, that's the first paid distribution channel live end-to-end.

If Jooble re-flags more issues, the next iteration would be content-shape filters (require both "responsibilities" AND "requirements" sections, not just a length floor). Don't ship that until we know it's needed — many partners are fine with the 250-char floor.

## Operational notes

- **Feed URL pattern:** `https://freejobpost.co/jobs.xml?ref=<partner>` for partner attribution; the `?ref=` param flows through every `<url>` and lands in `apply_clicks` for per-partner click data.
- **Feed health check (deferred ops item):** `partnerContactsAreFresh()` exists in `partner-contacts.ts` but isn't wired into a cron yet. Worth wiring before paid placement traffic to know if a partner stops crawling.
- **History:** historical state from the 2026-05-08 doc (Adzuna qualification questions, original partner-email bounces, the 4-partner email-channel diagnosis) is preserved in git history of this file if needed for context.
