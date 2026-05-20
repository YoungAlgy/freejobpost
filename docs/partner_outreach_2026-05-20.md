# Publisher-program outreach drafts — 2026-05-20

Copy/paste targets for the 4 volume-friendly publisher programs. Each goes
to the publicly-listed partner intake address. Plain text, no HTML — these
inboxes are humans + ticket systems and HTML often gets stripped or sent
to spam.

Send from `alex@avahealth.co`. Subject lines are designed to bypass the
"generic publisher pitch" pattern matchers most of these inboxes run.

---

## 1) Talent.com

**To:** `partner@talent.com`
**Subject:** Healthcare-only XML feed — 8,961 active US jobs

Hi Talent.com partners team,

I run freejobpost.co — a healthcare-only job board operated by Ava Health
Partners (US healthcare staffing firm, FL-headquartered). We aggregate
active openings from real ATS sources (USAJobs federal, Cleveland Clinic,
AdventHealth, Mass General Brigham, Stanford, Saint Luke's, Elevance,
Greenhouse and Lever boards for Oscar Health, One Medical, Talkiatry,
Headway, Lyra, and a handful of others).

Current inventory: 8,961 active US healthcare jobs, refreshed every 4
hours via cron. Indeed v2 XML, valid <source>/<job> envelope, ~28 MB
gzipped.

Feed URL (Talent.com-attributed):
  https://freejobpost.co/jobs.xml?ref=talent

The ?ref=talent tag templates into every <url>, so apply clicks that
originate from your re-syndication carry verifiable per-source
attribution back through our /click/[slug] redirect — you'll see real
click data we can share back to confirm placement quality.

Inventory breakdown:
- 2,576 U.S. federal positions (VA / IHS / DoD military health / NIH / HHS)
- 1,534 AdventHealth
- 1,466 Cleveland Clinic
- 1,339 Mass General Brigham
- ~2,000 from Workday, Greenhouse, Lever, Ashby tenants
- 425 originated (Ava Health-seeded + future employer-posted)

Happy to walk through schema, attribution, or any partner-specific feed
variants you need (we can split out an originated-only feed at
/feeds/originated.xml if dup-detection requires it).

Best,
Alex
Ava Health Partners · freejobpost.co
alex@avahealth.co · (813) 531-8049
4532 W Kennedy Blvd Ste 125, Tampa, FL 33609

---

## 2) Adzuna

**To:** `data@adzuna.com`
**Subject:** US healthcare job feed for Adzuna ingestion

Hi Adzuna team,

I run freejobpost.co — a healthcare-only US job board (operated by Ava
Health Partners, FL). Inventory is 8,961 active healthcare openings,
aggregated from USAJobs federal, hospital Workday tenants (Cleveland
Clinic, AdventHealth, Mass General Brigham, Stanford, Saint Luke's,
Elevance), and Greenhouse/Lever/Ashby boards (Oscar, One Medical,
Talkiatry, Headway, Lyra, Bicycle Health, Tia).

Indeed-spec XML, refreshed every 4 hours, full descriptions + per-job
salary bands + state/city.

Feed URL (Adzuna-attributed):
  https://freejobpost.co/jobs.xml?ref=adzuna

The ?ref=adzuna parameter routes apply-click attribution back through our
endpoint so we can share verified click data per source if useful for
quality scoring.

Let me know if you need a sample, a schema doc, or anything else from our
side to get this into your ingestion queue.

Best,
Alex
Ava Health Partners · freejobpost.co
alex@avahealth.co · (813) 531-8049
4532 W Kennedy Blvd Ste 125, Tampa, FL 33609

---

## 3) Jooble

**To:** `partners@jooble.com`
**Subject:** Healthcare XML partner feed — 8,961 active US jobs

Hi Jooble partners team,

I run freejobpost.co — a US healthcare-only job board (Ava Health
Partners, FL-headquartered). 8,961 active healthcare openings, sourced
directly from hospital ATS APIs (federal USAJobs, plus Workday tenants
including AdventHealth, Cleveland Clinic, Mass General Brigham, Stanford,
Saint Luke's, Elevance), and major Greenhouse/Lever/Ashby boards.

Indeed v2 XML envelope (your <source>/<job> spec). Refreshes every 4
hours via cron, full descriptions, geo, salary bands, employment type.

Feed URL (Jooble-attributed):
  https://freejobpost.co/jobs.xml?ref=jooble

The ?ref param routes click attribution back through our /click/[slug]
endpoint — happy to share aggregate click data per source if helpful for
your quality model.

Let me know what you need from our side to add this to your crawl
schedule.

Best,
Alex
Ava Health Partners · freejobpost.co
alex@avahealth.co · (813) 531-8049
4532 W Kennedy Blvd Ste 125, Tampa, FL 33609

---

## 4) Glassdoor

Glassdoor is owned by Indeed since 2018 — its job-feed ingestion runs
through the Indeed publisher program. Free organic feeds were retired in
2023; getting into Indeed/Glassdoor now requires either:

  - Appcast partner channel (CPC-based, ~$1-3k minimum monthly)
  - Pandologic / Joveo / Recruitology managed feed
  - Direct sales contact for Indeed Enterprise

Action: skip cold-email to Glassdoor. Wait until Talent.com / Adzuna /
Jooble confirm placement and produce attributable apply-click volume,
then use that as the wedge for a paid Indeed channel conversation.

---

## Tracking after send

- Subject lines are unique per email for filter-rule routing.
- Once partner confirmation lands, the first `apply_clicks` rows with
  `partner='<key>'` will appear in `partner_attribution_daily` view.
- If no reply in 10 business days: one polite follow-up referencing the
  thread, not a re-send.

## Hard rules followed in these drafts (per S1 cold-outreach standards)

- No competitor name-drops
- No "I'll keep an ear out elsewhere" implicit redirect
- Single CTA (review the feed)
- Plain opt-out posture (these are b2b sender-prefers-not-to-spam; not
  consumer outreach, no formal "unsubscribe" line needed)
- Verified business NAP (Tampa office)
- No salary or bonus disclosure
