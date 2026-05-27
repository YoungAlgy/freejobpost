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

1. **Consent UX:** Are we OK with adding ONE pre-redirect step at /apply/[slug]? It's 1 form + 1 button between Apply-click and the employer's ATS. Could reduce apply-through-rate by 5-15% (typical for any form interstitial). Net effect: higher-quality CRM signal at the cost of slightly fewer raw applies.

2. **Welcome email:** Default to OFF, or default to ON when consent is given? My take: default OFF, recruiter manually opts the lead in to a drip. Less spam-feel.

3. **Flow B direction:** Should the freeresumepost profile use the candidate's FULL CRM resume, or a redacted version (no current employer, no specific dates)? My take: redacted, with a "request full resume" CTA that pings the recruiter.

4. **Identity carry:** Should freejobpost gain a candidate login (so we know who's applying without re-asking)? Currently it's apply-as-guest. Adding login adds friction; not requiring it means we re-ask name/email on every apply.

5. **Naming:** "Ava Health" surfaces on the consent text and welcome email even though the user is on freejobpost.co. That's fine because the footer + JSON-LD already disclose the parent corp — but worth confirming you want the Ava brand on this comm.

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
