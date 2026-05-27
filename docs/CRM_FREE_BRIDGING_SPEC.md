# CRM ↔ free* Bridging Spec (draft)

Date: 2026-05-27
Status: **DRAFT — not yet implemented.** Captures the design after the Q2 strategy decision to pursue the bridging path. Implementation gated on Algy's go-ahead because it touches the paid CRM.

## Goal

Two-way data flow between the candidate-facing free properties (freejobpost.co + freeresumepost.co) and the paid recruiter CRM (app.avahealth.co), with **explicit, granular candidate consent at every step**.

Strategic value: turns the free properties into both a top-of-funnel acquisition surface AND a continuous CRM enrichment loop. This is the path-6 moat from the aggregation strategy.

## Two flows, gated separately

### Flow A — freejobpost candidate apply → CRM lead

**Trigger:** Candidate clicks Apply on a /jobs/[slug] page.

**Today's behavior:** /click/[slug] logs the click to apply_clicks (with bot filter), 302-redirects to the employer's ATS. Candidate's identity stays on the employer's side. We have zero CRM signal from public-feed applies.

**Proposed behavior:**
1. Apply flow gets a NEW pre-redirect step at `/apply/[slug]` (only when candidate has a stored profile, see below)
2. Form: name (pre-filled), email, phone, state, optional resume upload, **opt-in checkbox** labelled:
   > "Let Ava Health recruiters reach out about other matches in {state} for {role}. We'll never sell your info. You can opt out any time. (default: unchecked)"
3. If checkbox checked → server-side POST to `app.avahealth.co/api/cross-site-lead` (HMAC-signed, rate-limited)
4. CRM creates a lead row with: source=`freejobpost`, source_url=apply_url, role_keywords=title-tokens, state, consent_at=NOW(), consent_text=verbatim
5. Candidate gets a one-shot welcome email from `recruiting@avahealth.co`: "Thanks for applying. Here are 3 other matches in your area." (links back to freejobpost search)

**Skip path:** If candidate doesn't check the box, behavior is identical to today (302 redirect, click logged, no CRM lead).

### Flow B — CRM open-to-work → freeresumepost profile

**Trigger:** Recruiter in app.avahealth.co marks a candidate as `open_to_work=true` AND the candidate has previously opt-ed in (separate checkbox during recruiter outreach).

**Today's behavior:** open_to_work is a private CRM flag. Candidate's resume sits only in the CRM, invisible to other recruiters and to Google.

**Proposed behavior:**
1. CRM trigger fires on `open_to_work = true AND consent_freeresumepost = true`
2. Server-side worker creates a freeresumepost profile via `freeresumepost.co/api/cross-site-profile` (HMAC-signed)
3. Profile is published with same privacy rules as direct uploads (first-name + last-initial public, email/phone always private, opt-out link in every notification)
4. CRM stores the freeresumepost_profile_url back on the candidate row so the recruiter can see + share it

**Privacy floor:** Only candidates who EXPLICITLY consent (separate from the apply opt-in in Flow A) get pushed to freeresumepost. There must be a clear visual on the recruiter side: "This action publishes this candidate's profile to a public job board."

## Consent UX requirements

- **Granular**: Flow A consent ≠ Flow B consent. Candidates can opt into one without the other.
- **Default off**: Both checkboxes default unchecked. No dark patterns.
- **Revocable**: One-click unsubscribe in every email. Revoking removes the lead from CRM + removes the profile from freeresumepost within 24h.
- **Audit**: Every consent grant + revoke logged with `consent_text` verbatim + `consent_at` timestamp + `consent_source_ip_hash`. Stored in `consent_log` table on the CRM side (legal evidence for any future privacy challenge).
- **TCPA/CAN-SPAM**: Welcome email + outreach must include physical address (Ava Health Tampa FL) and unsubscribe link. Phone consent (SMS) is a separate checkbox — not implied by email consent.

## Implementation surface

### freejobpost side (new code)
1. `src/app/apply/[slug]/page.tsx` — pre-redirect form (only renders if candidate is logged in OR has cookie). Server action submits to internal `/api/lead-bridge`.
2. `src/app/api/lead-bridge/route.ts` — server-side handler. Validates input, HMAC-signs payload, POSTs to `app.avahealth.co/api/cross-site-lead`. Returns 200 then 302 redirects to apply_url.
3. `src/lib/consent-text.ts` — single source of truth for the exact consent string shown to candidates. Versioned (consent_text_v1, v2, etc.) so we can prove what each candidate agreed to.

### CRM side (new code — gated on Algy approval)
1. `app/api/cross-site-lead/route.ts` — HMAC-verify, rate-limit (50 leads/min), upsert to leads table with source=freejobpost
2. `app/api/cross-site-profile/route.ts` — HMAC-verify, rate-limit, POST to freeresumepost api
3. `consent_log` table + triggers
4. Recruiter UI on candidate detail page: "Publish to freeresumepost (requires candidate consent)" button

### freeresumepost side (new code)
1. `src/app/api/cross-site-profile/route.ts` — HMAC-verify, create candidate profile (same code path as the public upload form), set `source=avahealth_crm_cross_site`
2. Daily reconciliation job: any freeresumepost profile with `source=avahealth_crm_cross_site` AND `revoked_at IS NOT NULL` in CRM → soft-delete on freeresumepost within 24h

### Shared
1. New env var: `CROSS_SITE_HMAC_SECRET` (32-char rotating secret, stored in Supabase vault)
2. New table: `consent_log` (cross-site append-only audit trail)

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Candidates feel tricked by checkbox | Default off, explicit text, easy revoke, no dark patterns |
| CRM lead-quality drops (free-feed leads are colder than direct outreach) | Tag leads with `source=freejobpost` so recruiters can filter; don't auto-enroll them in cold drips |
| HMAC secret leak via env var exposure | Store in Supabase vault, rotate 6-monthly, log every HMAC failure with source IP |
| CCPA/GDPR Right-to-Delete request | `consent_log` + bidirectional deletes via reconciliation; documented process for handling requests |
| Reputation damage if outreach feels spammy | One welcome email max; rest of CRM outreach respects standard 30-day cooldown |

## Open questions for Algy

> **2026-05-27 — Algy delegated these decisions to Claude with "do whatever u think is smart." Below are my recommended answers. Override any of these in a follow-up PR if you disagree.**

1. **Consent UX — RECOMMENDED: SKIP Flow A.** Don't add the pre-redirect form. The apply-through-rate cost (5-15%) is real and the candidate signal we'd gain is weak without volume. Implement Flow B only (CRM-side push to freeresumepost). Revisit Flow A after Flow B proves the bridging architecture in production.

2. **Welcome email — RECOMMENDED: OFF by default.** Recruiter manually opts the lead into a drip after first qualification call. Less spam-feel, higher-quality outreach. (Only relevant if Flow A is ever turned on.)

3. **Flow B direction — RECOMMENDED: REDACTED profile.** freeresumepost gets first-name + last-initial, role, state, years experience. "Request full resume" CTA pings the recruiter who controls the full release. Matches existing freeresumepost privacy floor (already does first-name + last-initial public).

4. **Identity carry — RECOMMENDED: KEEP apply-as-guest.** Don't add candidate login to freejobpost. Adding login = adding friction. The current flow optimizes for candidate-first volume. (Only relevant if Flow A is ever turned on.)

5. **Naming — RECOMMENDED: Use "Ava Health" branding.** The footer + JSON-LD already disclose the parent corp. Consent text reads naturally as "Ava Health recruiters" since that's the actual entity reaching out. No need to introduce a new brand voice mid-flow.

## Scope decision (post-Algy-delegate)

Implementing **Flow B only** in v1. Spec sections about Flow A (apply-form, consent_log row for apply opt-in) stay as documentation but aren't coded until a future iteration.

This cuts the implementation estimate from 6 days to ~3 days:
- freeresumepost `/api/cross-site-profile` (HMAC-verify, create candidate row from CRM payload) — 0.5 day
- CRM `consent_freeresumepost` column + UI checkbox on candidate detail — 1 day
- CRM `/api/cross-site-profile/sync` worker — 1 day
- Reconciliation cron (revoked → soft-delete on freeresumepost) — 0.5 day

## Estimated effort

| Component | Effort | Risk |
|---|---|---|
| freejobpost /apply form + handler | 1 day | Low |
| CRM /api/cross-site-lead + leads schema changes | 1 day | Medium (touches paid CRM) |
| freeresumepost /api/cross-site-profile | 0.5 day | Low |
| consent_log table + audit trail | 0.5 day | Low |
| Recruiter-side "Publish to freeresumepost" UI | 1 day | Medium |
| Reconciliation job + revoke flow | 1 day | Medium |
| End-to-end test suite + privacy walkthrough | 1 day | Low |
| **Total** | **6 days** | |

## Next steps

1. Algy reviews this spec + answers Open Questions
2. Spec freezes at v1 (this file becomes the contract)
3. Implementation in this order: freeresumepost api → freejobpost form → CRM api → reconciliation → UI polish
4. Soft-launch with one specialty (Nursing) as canary; expand after 2-week observation

---

*Spec status: draft. Will be deleted from repo or moved to /docs/shipped/ once implementation lands.*
