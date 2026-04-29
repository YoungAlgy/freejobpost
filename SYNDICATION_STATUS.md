# Syndication submission status

**Generated:** 2026-04-29 (this session)
**Source of truth playbook:** `src/app/feeds/page.tsx:17-27`

## Current state per network

| Network | Status | Action |
|---|---|---|
| Indeed | ✅ Passive (auto-crawl via JSON-LD) | No submission needed — Indeed retired the public "add XML feed" flow; their crawler picks up `JobPosting` JSON-LD on `/jobs/[slug]` automatically. |
| Glassdoor | ✅ Passive (Indeed-owned, same pipeline) | No submission needed. |
| Google for Jobs | ✅ Passive (JSON-LD on `/jobs/[slug]`) | No submission needed beyond submitting `sitemap.xml` to Google Search Console. |
| RSS | ✅ Passive (auto-discover) | No submission needed. |
| Adzuna | 📧 Email draft below | Their `/partners.html` is dead and `/hire/partners/` is for distribution partners (sites *displaying* Adzuna jobs). Email content team to add freejobpost.co's feed. |
| Jooble | 📧 Email draft below | Per playbook: `partners@jooble.com`. |
| ZipRecruiter | 📧 Email draft below | Per playbook: `partners@ziprecruiter.com`. |
| Talent.com | 🔒 Account required | `talent.com/publishers` requires publisher login first → out of scope this session (no new account creation). Algy can sign up for Talent.com Publisher account, then add `https://freejobpost.co/feeds/talent.xml` in their portal. |
| LinkedIn | 🔒 Gated | Job Wrapping requires LinkedIn Talent Solutions rep + a freejobpost.co LinkedIn Company Page. Out of scope this session. Algy contacts his LinkedIn Recruiter rep when ready. |

## Email drafts (Algy to send)

All three email drafts use the same body with the network name swapped. Copy the relevant block, paste into your mail client, send from your domain (e.g. `alex@avahealth.co`).

---

### Adzuna (`content@adzuna.com` — primary; cc `support@adzuna.com` if no reply in 5 business days)

**Subject:** Healthcare jobs feed for Adzuna ingestion — freejobpost.co

```
Hi Adzuna content team,

I run freejobpost.co, a free healthcare-only US job board (~430 active
listings, growing weekly). I'd like to add our XML feed to Adzuna's index so
our jobs surface in your healthcare-vertical results.

Feed details:
  Format: Indeed v2 XML
  URL:    https://freejobpost.co/feeds/adzuna.xml
  Refresh: 15 minutes (ISR cycle)
  Coverage: 50 US states, all major healthcare specialties (MD, NP, PA, RN,
  CRNA, allied health). Each listing links back to a structured /jobs/[slug]
  page with JobPosting JSON-LD for additional metadata.

We're a free job board (no fee to post, no fee to apply). Listings drop from
the feed within 15 minutes when removed or expired. Each listing includes
salary disclosure where the employer chose to share it.

Happy to provide a custom feed format if Adzuna has a preferred schema.

Partner-facing docs: https://freejobpost.co/feeds

Thanks,
[Algy]
freejobpost.co
```

---

### Jooble (`partners@jooble.com`)

**Subject:** Healthcare jobs feed for Jooble — freejobpost.co

```
Hi Jooble partners team,

I'd like to add freejobpost.co's healthcare jobs feed to Jooble. Per the
playbook on https://www.jooble.org/info/about-us, this is the standard intake
path for new content providers.

Feed details:
  Format: Jooble XML
  URL:    https://freejobpost.co/feeds/jooble.xml
  Refresh: 15 minutes
  Coverage: 50 US states, healthcare specialties (MD, NP, PA, RN, CRNA, allied
  health). Free site (no fee to post, no fee to apply).

Each listing links back to a structured /jobs/[slug] page on freejobpost.co
with JobPosting JSON-LD. Expired or removed jobs drop from the feed within
15 minutes.

Partner-facing docs: https://freejobpost.co/feeds

Thanks,
[Algy]
freejobpost.co
```

---

### ZipRecruiter (`partners@ziprecruiter.com`)

**Subject:** Healthcare jobs feed for ZipRecruiter Open Network — freejobpost.co

```
Hi ZipRecruiter partner team,

I run freejobpost.co, a free US healthcare-only job board, and I'd like to
participate in the ZipRecruiter Open Network. Per your partner intake docs,
this is the right inbox to share our feed URL.

Feed details:
  Format: Indeed v2 XML (the same format ZipRecruiter accepts)
  URL:    https://freejobpost.co/feeds/ziprecruiter.xml
  Refresh: 15 minutes (ISR cycle)
  Coverage: 50 US states, healthcare specialties (MD, NP, PA, RN, CRNA, allied
  health). Free job board — no fee to post, no fee to apply.

Each listing links back to a structured /jobs/[slug] landing page with
JobPosting JSON-LD. Listings drop from the feed within 15 minutes when
removed/expired.

Partner-facing docs: https://freejobpost.co/feeds

Thanks,
[Algy]
freejobpost.co
```

---

## What changed since the playbook was written

The `/feeds` page playbook (in `feeds/page.tsx:17-27`) has two stale links:

1. **`adzuna.com/partners.html`** — 404. Adzuna restructured: `/hire/partners/`
   is now the publisher-distribution program (sites *displaying* Adzuna jobs).
   Content provider intake is informal — content team email.
2. **`employers.indeed.com → Free Posting → Add XML feed`** — Indeed retired
   the public XML feed onboarding. Their crawler auto-picks up JSON-LD on job
   pages instead.

Recommend: when this session is closed out, update `feeds/page.tsx:17-27`
to reflect the current intake paths (Adzuna → email content team, Indeed →
passive auto-crawl). Not done in this session because the changes are minor
copy edits and `feeds/page.tsx` is partner-facing internal doc.

## Verification after Algy sends emails

When confirmed (typically 24-48h for Adzuna/Jooble, 5-10 days for ZipRecruiter):

1. Search the network for `freejobpost.co` or a known job title from our feed
2. Confirm the click-through lands on `https://freejobpost.co/jobs/<slug>` with
   correct UTM/referrer tracking (`?utm_source=adzuna` etc.)
3. Spot-check the listing's salary, location, and apply link match the source
