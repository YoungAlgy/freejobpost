// Source of truth for the public /changelog page + /changelog/feed.xml.
// Hand-curated; prepend a new entry on every user-visible ship.
// See memory/feedback_changelog_discipline.md for the rule.

export type ChangelogTag =
  | 'new'
  | 'improved'
  | 'fixed'
  | 'reliability'
  | 'security'

export interface ChangelogEntry {
  date: string // YYYY-MM-DD
  title: string
  body: string
  tag: ChangelogTag
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  // ── May 2026 ──────────────────────────────────────────────────────────────
  {
    date: '2026-05-29',
    title: 'Closed jobs now point you to similar open roles',
    body:
      'When a listing comes down — filled, or its posting window ended — its page used to dead-end on a 404. Now it shows a clear "position closed" notice plus a list of similar open roles in the same specialty and state, with quick links into the relevant job hubs. A stale search result or a saved link still lands you somewhere useful instead of on a dead page.',
    tag: 'improved',
  },
  {
    date: '2026-05-29',
    title: 'Browse related jobs across specialties + states',
    body:
      'Every "[specialty] jobs in [state]" page now links to its closest neighbors — the same specialty in other states, plus other in-demand specialties in the same state — each tagged with a live open-job count. Jump straight from, say, RN jobs in Texas to RN jobs in Florida, or to PA / NP / family-medicine jobs in Texas, without back-tracking through search. Every link points to a page with real open inventory (5+ jobs), so you never land on an empty result.',
    tag: 'improved',
  },
  {
    date: '2026-05-27',
    title: '2 more major health systems added — Intermountain Health + Cigna',
    body:
      'Intermountain Health (~1,271 jobs across UT, ID, NV) brings their full clinical roster including physicians, imaging, RN/LPN, allied health, and clinic ops. Cigna (~630 jobs) adds the insurance side — utilization management, case managers, provider contracting clinicians, behavioral health clinicians, and Accredo specialty pharmacy. Bringing total Workday board count to 12, total active inventory above 12,000 healthcare jobs across all sources.',
    tag: 'new',
  },
  {
    date: '2026-05-26',
    title: '4 major health systems added — +5,100 healthcare openings',
    body:
      'Four big-name non-profit hospital systems are now integrated employer feeds. Banner Health (~1,050 jobs across AZ/CO/NE/NV/WY, 28 hospitals), Ochsner Health (~1,933 jobs across LA + the Gulf South), Highmark Health / Allegheny Health Network (~1,802 jobs across PA/NY/DE/WV, including the AHN hospital arm and Highmark BCBS), and NewYork-Presbyterian (~364 jobs across Manhattan, Queens, and Westchester). Mostly nursing, allied health, and clinical support — auto-refreshed every 4 hours alongside the existing Cleveland Clinic / AdventHealth / Mass General Brigham / Stanford / Saint Luke\'s / Elevance feeds.',
    tag: 'new',
  },
  {
    date: '2026-05-26',
    title: 'Workday descriptions auto-recover + bot-filtered apply analytics',
    body:
      'Two reliability wins on the same day. (1) The 3,292 thin-description Workday jobs (AdventHealth, Cleveland Clinic, Mass General Brigham, Stanford, Saint Luke\'s, Elevance) that were stuck on the ~150-char listing preview now get backfilled with their full job descriptions via a new every-4-hour cron. About 50 jobs per tick, drains the backlog in ~15 days, no Workday throttle. Once a description is recovered, the listing reads as a real posting (instead of "see employer site for details") and becomes eligible for Google for Jobs indexing. (2) Cleaned the apply-click attribution dashboard. The May-26 audit caught crawler traffic inflating the daily "internal" partner count by ~830× (16,310 bot hits vs 12 real human applies in a single day). New writes now skip the apply_clicks insert on bot user-agents (Googlebot, AhrefsBot, SemrushBot, headless Chrome, curl/wget/python-requests, link previewers, etc.) and the partner_attribution_daily view filters historical bot rows out via an is_bot flag backfill. Real apply counts now show through to the employer dashboard.',
    tag: 'reliability',
  },
  {
    date: '2026-05-26',
    title: 'Ava Health enrolled in E-Verify',
    body:
      'Ava Health Partners LLC is now an enrolled participant in the federal E-Verify employment authorization system (Company ID 3024987, MOU effective 2026-05-26). Added a small "E-Verify Participant" chip to the footer linking to a new /e-verify page with the full federal-compliance statement, official DHS Participation poster, DOJ Right to Work poster, and Florida SB 1718 context. We enrolled proactively below the FL SB 1718 25-employee threshold so the compliance ramp is in place as the team grows. Doesn\'t change anything for candidates or employers posting jobs here; it\'s confirmation that any future Ava Health hire goes through federal work-eligibility verification.',
    tag: 'improved',
  },
  {
    date: '2026-05-24',
    title: 'Pay ranges + AI-discovery + EEO + canonical contact email',
    body:
      'Wired Workday-tenant pay ranges into the import pipeline so when an employer opts into pay-transparency on their job posting, that range now shows up in our JobPosting schema and is searchable by Google for Jobs. USD only; hourly rates are annualized to a 40-hour year. Most employers still hide salary, but the ones who don\'t get full credit for the disclosure. Added an llms.txt at the site root so ChatGPT, Claude, and Perplexity can discover the job board cleanly. Added a federal Equal Opportunity statement to the footer. Switched the customer-facing contact email to info@avahealth.co (more professional than a personal address; same mailbox underneath).',
    tag: 'improved',
  },
  {
    date: '2026-05-22',
    title: 'Polish pass: link previews, error pages, page titles, a11y',
    body:
      '14 pages were rendering blank or default link-preview cards when shared to LinkedIn / iMessage / Slack — now every page emits the branded Open Graph card. Added a styled error page with one-click retry for transient failures. Stopped browser tabs from showing the brand twice on the home page. Added aria-pressed to the LOCATION toggle buttons so screen-reader users can hear which mode is active. Locked the specialty .or() filter behind a unit-tested helper across all three consumers (hub pages, city × specialty pages, RSS feeds) so future regressions of the encoding bug get caught in CI before they ship.',
    tag: 'improved',
  },
  {
    date: '2026-05-22',
    title: 'Bug fix: hundreds of specialty hub pages were silently empty',
    body:
      'A PostgREST URL-encoding bug was causing specialty hubs with multi-word match patterns (Physician Assistant, Registered Nurse, Family Medicine, Internal Medicine, Hospital Medicine, Emergency Medicine, etc.) to silently return zero jobs at runtime. Build-time + sitemap thought the pages existed; the live pages returned 404s. Discovered + fixed in an overnight audit pass. Hundreds of long-tail listing pages now render full inventory.',
    tag: 'fixed',
  },
  {
    date: '2026-05-22',
    title: '20 career-path guides for healthcare roles',
    body:
      'Plain-English "How to become an X" guides for RN, NP, PA, CRNA, PharmD, LPN, CNA, PT, RT, MA, Surgical Tech, Radiologic Tech, OT, SLP, EMT/Paramedic, Phlebotomist, Dental Hygienist, Dietitian, Audiologist, and Genetic Counselor. Each guide covers education, licensing, exam, timeline, practice settings, and compensation, with direct deep-links to current openings. Sourced from BLS, NCSBN, NBRC, CAPTE, NCCPA, ARRT, NBCOT, ASHA, AAMA, AMT, ABGC, ASCP, ADHA, CDR.',
    tag: 'new',
  },
  {
    date: '2026-05-22',
    title: 'City × Specialty long-tail matrix',
    body:
      'Pages like /city/tampa-fl/registered-nurse, /city/houston-tx/cardiology now exist for every (metro × specialty) combination with five or more active matching jobs. Same threshold as the existing state × specialty matrix.',
    tag: 'new',
  },
  {
    date: '2026-05-22',
    title: 'RSS feed per specialty + per state',
    body:
      'Niche aggregators and RSS readers can now subscribe to /feeds/specialty/<slug> or /feeds/state/<slug> for filtered job streams. 28 specialty feeds + 50 state feeds, auto-discoverable via <link rel="alternate"> on each hub page.',
    tag: 'new',
  },
  {
    date: '2026-05-21',
    title: 'City hub pages — 32 US healthcare metros',
    body:
      'Pages like /city/tampa-fl, /city/houston-tx, /city/boston-ma now exist for every top US healthcare market. Each carries a major-employer breakout + active openings filtered to that metro. Closes the gap between state-level hubs and per-job pages.',
    tag: 'new',
  },
  {
    date: '2026-05-21',
    title: 'Per-partner feed quality pass',
    body:
      'Every per-partner XML feed (Indeed, ZipRecruiter, Glassdoor, Talent.com, Adzuna, Jooble, Careerjet, LinkedIn, RSS) now filters out jobs with empty descriptions before publishing. Healthier feeds = better partner ingestion + cleaner search-engine indexing.',
    tag: 'improved',
  },
  {
    date: '2026-05-21',
    title: 'Bug fix: 655 jobs missing from Google for Jobs',
    body:
      'Some ATS-imported jobs were silently missing from Google for Jobs and from every per-partner feed because of how the import RPC initialized their syndication preferences. Fixed at the data layer + render layer so those jobs now show up everywhere.',
    tag: 'fixed',
  },
  {
    date: '2026-05-20',
    title: 'Careerjet added as a 4th partner channel',
    body:
      'Careerjet (international job-search aggregator, 90+ countries) now reads /feeds/careerjet.xml. Adds ~20M monthly searches of reach for every job you post.',
    tag: 'new',
  },
  {
    date: '2026-05-20',
    title: 'Submitted to Talent.com, Adzuna, and Jooble',
    body:
      'Free-tier publisher programs at Talent.com, Adzuna, and Jooble received our feed via their partner intake forms today. Aggregator placement onboarding takes 1–2 weeks; tracking attributed traffic via our new partner-attribution dashboard once placements go live.',
    tag: 'new',
  },
  {
    date: '2026-05-19',
    title: 'Per-Apply-click attribution',
    body:
      'Every Apply-button click now logs the source partner (talent, adzuna, jooble, careerjet, glassdoor, RSS, or internal). Lets us prove which boards actually drive applicants — and gives employers an honest per-source breakdown.',
    tag: 'new',
  },
  {
    date: '2026-05-19',
    title: 'Bug fix: 3,443 jobs returning 404',
    body:
      'Workday job IDs use uppercase letters (R2654676, JR192702, etc.) but our slug validator rejected uppercase characters, sending users to a 404 page. 3,443 active jobs — 39% of the listing — were unreachable. Fixed: uppercase slugs now resolve normally.',
    tag: 'fixed',
  },
  {
    date: '2026-05-19',
    title: 'Sitemap fix: 1,165 → 9,328 URLs',
    body:
      'The sitemap was capping at 1,000 URLs due to a PostgREST query-limit edge case, so search engines were only seeing about 13% of our inventory. Fixed with a parallel-batch fetch pattern. Google + Bing now see every active job.',
    tag: 'fixed',
  },
  {
    date: '2026-05-13',
    title: 'Specialty × state landing pages',
    body:
      'Pages like /specialty/registered-nurse/florida now exist for every viable combination. Each renders only when there are ≥5 active matching jobs, so you never land on an empty page.',
    tag: 'new',
  },
  {
    date: '2026-05-13',
    title: 'Salary panel on state + specialty hubs',
    body:
      'Every state and specialty hub now shows a real pay range computed from the live job inventory — 10th–90th percentile bounds with the median called out. No more guessing.',
    tag: 'new',
  },
  {
    date: '2026-05-13',
    title: 'State hub editorials + license-board links',
    body:
      'All 50 state hubs now carry a short, factual market note plus the actual state nursing board name + URL and Nurse Licensure Compact status. Useful before you accept an interview.',
    tag: 'improved',
  },
  {
    date: '2026-05-13',
    title: 'Mobile nav + iOS input fix',
    body:
      'Mobile nav was hiding all secondary links on small screens. Fixed across every key surface. Also stopped iOS Safari from auto-zooming when you tap an input — forms feel native now.',
    tag: 'fixed',
  },
  {
    date: '2026-05-13',
    title: 'Sign-on bonus stripped from public titles',
    body:
      'A handful of seeded job titles were leaking sign-on bonuses into the title and search labels. Cleaned up at the data layer plus a defense-in-depth render guard.',
    tag: 'fixed',
  },
  {
    date: '2026-05-13',
    title: 'IndexNow — new jobs ping Bing + Yandex',
    body:
      'New job posts now push to Bing, Yandex, Naver, Seznam, and Yep within seconds of publishing. Indexing latency on non-Google search engines drops from days to minutes.',
    tag: 'reliability',
  },
  {
    date: '2026-05-13',
    title: 'Server-side 10-post quota enforcement',
    body:
      'The "10 free posts per employer" cap is now enforced on the server, not just the UI. Graceful-degrade: if the quota check itself fails, the post still goes through.',
    tag: 'reliability',
  },
  {
    date: '2026-05-13',
    title: 'Next.js 16.2.4 → 16.2.6 (DoS patch)',
    body:
      'Bumped Next.js to patch a Server-Components DoS vulnerability. No user action required.',
    tag: 'security',
  },
  // ── May 8 batch ───────────────────────────────────────────────────────────
  {
    date: '2026-05-08',
    title: 'Employer applicant tracking',
    body:
      'Employer dashboard now shows applicant contact info inline — name, email, phone, applied date — without a click-through. The "see who applied" experience matches Indeed without the paywall.',
    tag: 'new',
  },
  {
    date: '2026-05-08',
    title: '/for-employers + /employers directory',
    body:
      'New employer acquisition page (/for-employers) explains the model without jargon. New /employers directory gives each verified hiring company its own SEO landing page.',
    tag: 'new',
  },
  {
    date: '2026-05-08',
    title: 'URL-state filter sync on /jobs',
    body:
      'Search filters now live in the URL. Deep-link a filtered view, share it, hit back — the filter state always matches what you see on screen.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Job list pagination',
    body:
      'Paginated at 50 jobs per page so the DOM never balloons past a thousand nodes. Pages load faster on slow connections.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Custom 404 page',
    body:
      'A real 404 page with helpful links back into the site instead of the framework default.',
    tag: 'improved',
  },
  {
    date: '2026-05-08',
    title: 'Open redirect + session-cookie hardening',
    body:
      'Closed an open-redirect vector in the employer auth flow and tightened session cookie flags. Bonus: Turnstile widget now resets cleanly after a failed submit.',
    tag: 'security',
  },
  // ── Launch ────────────────────────────────────────────────────────────────
  {
    date: '2026-04-27',
    title: 'Initial launch',
    body:
      'freejobpost.co goes live — free healthcare job posts, no auction, no paywall, no recruiter spam. Includes JobPosting JSON-LD for Google for Jobs visibility from day one.',
    tag: 'new',
  },
]

/**
 * Returns a slugified anchor ID for an entry — used by both the page (id=)
 * and the RSS feed (guid). Stable across edits to title/body so subscribed
 * readers don't see duplicate items.
 */
export function entryAnchor(entry: ChangelogEntry): string {
  return `${entry.date}-${entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}
