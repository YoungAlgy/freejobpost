# freejobpost.co — Backlog

Items captured here are NOT for the current sprint. They live here so they
don't get lost. Pull into active work when the current phase completes.

**Current phase:** Phase 1 (real-employer onboarding — first 25 verified employers)
**Phase 0 verified complete:** 2026-05-08

---

## Code quality (Phase 1+)

- [ ] Split `post-job-form.tsx` (495 LOC) into `PostJobStep1`, `PostJobStep2`,
      `PostJobStep3` components — touch when next modifying the form
- [ ] Extract `formatSalary()` to a single shared file; currently duplicated in
      `public-jobs.ts` (freejobpost) and a reimplementation in freeresumepost
- [ ] Add Vitest test suite when first payment, auth mutation, or new PII flow ships
- [ ] Address PostCSS moderate vulns — watch for next Next.js bump to resolve
- [ ] Full audit of all `dangerouslySetInnerHTML` uses (current count: 13 freejobpost
      + 6 freeresumepost; spot-check passed 2026-05-08 but thorough audit deferred)
- [ ] Review cross-repo specialty-slug type/registry pattern; consider a tiny shared
      `@freejobpost/specialty-registry` package if the lists drift

## Aggregator + distribution (Phase 1+)

- [ ] Talent.com publisher onboarding — no public channel as of 2026-04-30; requires
      LinkedIn outreach to a Talent.com Partnerships employee
- [ ] LinkedIn Job Wrapping activation — requires Talent Solutions rep + freejobpost
      Company Page (created 2026-04-29 at linkedin.com/company/freejobpost);
      Algy contacts his LinkedIn Recruiter rep when ready
- [ ] Bing IndexNow integration — push new content to Bing on publish (requires
      key file deployed to /public/). Low priority while Bing imports GSC sitemap.
- [ ] Quarterly partner email re-verification — email-channel contacts in
      `partner-contacts.ts` have `lastVerifiedAt`; set a calendar reminder for
      2026-07-30 to re-verify all `email_active` entries

## Trust signals (Phase 1+)

- [ ] Real client testimonials — 2-3 quotes from early verified employers once
      onboarded; anonymized ("FL hospital group, Tampa Bay area") is fine
- [ ] HIPAA / SOC2 posture statement on freeresumepost.co privacy page —
      candidate PII (resume `parsed_profile`) is server-side only; document it
- [ ] BBB / HFMA / NAHCR membership — Phase 1-2 trust signals for hospital HR
- [ ] Case study pages for first 3–5 onboarded employers (once they exist)
- [ ] Press kit page — defer until actual press mentions exist

## SEO / content (Phase 2+)

- [ ] City-level hubs (top 100 US metro areas) — only after real-employer supply
      exists per metro; don't add until inventory justifies the page
- [ ] Per-employer SEO landing pages `/employer/[slug]` — foundation exists,
      activate when 5+ distinct verified employers each have ≥5 listings
- [ ] Blog at `/blog` — 1-2 posts/month on healthcare hiring trends, salary data;
      cross-link from providers.avahealth.co (200+ existing posts) for authority
- [ ] Long-form guides: healthcare licensure by state, salary by specialty, CRNA
      travel pay breakdown — high-intent SEO candidates

## Healthcare-specific differentiation (Phase 1-2)

- [ ] Acuity / float / call-coverage required fields on post-job form
- [ ] NPI-taxonomy specialty cross-reference for better candidate match scoring
- [ ] Pay-transparency auto-enforcement for CA/CO/NY/WA/NJ/IL/MD (enforce
      salary fields on submit when posting-state is one of these)
      — Note: already labeled in syndication_targets blurb; may be partly done
- [ ] Credentialing detail fields: board cert, fellowship, licensure state

## Resume-side conversion (Phase 1)

- [ ] LinkedIn one-click import to skip the resume upload step on freeresumepost.co
- [ ] Specialty-targeted match preview — show 3 matched jobs to anonymous user
      before asking for upload (demand-first conversion step)
- [ ] Re-upload / re-parse flow — add "Update resume" button once >50 lifetime uploads
- [ ] Social proof on freeresumepost.co homepage — real employer logos once available

## Multi-property brand discipline (Phase 2+)

- [ ] avahealth.co → freejobpost.co cross-link audit — make sure referring pages
      have correct UTM params and don't link to dead or redirected routes
- [ ] Footer pattern standardization — both free* apps should share the same footer
      boilerplate (entity info, links, privacy/terms)

## Code dedup (Phase 2)

- [ ] Shared Supabase client config — near-identical in both repos; extract
- [ ] Shared OG image template generator — same pattern in both repos
- [ ] Shared icon + apple-icon factory
- [ ] Shared layout boilerplate (footer, JSON-LD wrapper, security headers)

## Operational / monitoring

- [ ] Monthly `npm audit` review — schedule calendar reminder
- [ ] Monthly aggregator-feed health check — `curl` every feed URL in
      `SYNDICATION_TARGETS`, confirm 200 + non-empty content
- [ ] Monthly seeded-vs-real-employer ratio report — track against Phase 1 target
      (>15% third-party share by day 90)
- [ ] Quarterly partner email re-verification (see above)
- [ ] `partnerContactsAreFresh()` — wire into the health-check cron once the cron
      infra is in place (function already exists in `partner-contacts.ts`)

## Decisions deferred (need Algy input when the time comes)

- When to introduce paid/sponsored tiers — trigger condition: ≥50 verified
  third-party employers and ≥1 paying employer requesting more visibility
- Whether to expand verticals (dental → pharma → licensed-clinician verticals
  beyond healthcare) — Ava is healthcare-only; expansion may dilute brand
- Whether avahealth.co itself should eventually redirect to / consolidate with
  freejobpost.co — long-term org + SEO question
- Long-term plan for freeresumepost.co if uploads stay slow after demand-side
  fix ships — candidate side may need a dedicated channel (Reddit, social)

---

*Updated 2026-05-08. Add items to the bottom of the relevant section; don't
reorder by importance — the sections are already priority-ordered.*
