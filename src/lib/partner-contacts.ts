// Operational playbook for submitting feeds to each syndication network.
//
// This is the human-side artifact: who to email, which addresses bounce,
// which portals are gated, and when each address was last verified to
// deliver. The engineering source of truth for *which* networks we publish
// to lives in `syndication-targets.ts`.
//
// Maintenance rule: re-verify deliverability every 90 days. The check is
// just "send a real test email and watch for a bounce within 24h." When
// you re-verify, update `lastVerifiedAt` and any `note` lines that have
// gone stale. Do NOT silently swap addresses — leave a comment showing
// what bounced so future you knows the previous address is dead.
//
// History:
// - 2026-04-29: Sent 4 partner intros from alex@avahealth.co. 3/4 bounced
//   silently (we noticed during a 2026-04-30 inbox audit).
// - 2026-04-30: Retried Jooble + ZR via support@ inboxes. Both delivered.
//   Updated this file to encode the working addresses.

import type { SyndicationTargetId } from './syndication-targets'

export type DeliveryStatus =
  | 'auto_crawl' // No submission needed — the network picks us up via JSON-LD or RSS auto-discovery
  | 'email_active' // Email channel verified delivering as of `lastVerifiedAt`
  | 'gated_portal' // Web portal that requires sales call / invite / Talent Solutions rep
  | 'channel_dead' // No working public channel as of last verification

export type PartnerContact = {
  /** Network id — matches `SyndicationTargetId` from syndication-targets.ts */
  target: SyndicationTargetId | 'sitemap'
  /** Current state of the submission channel */
  status: DeliveryStatus
  /**
   * Primary email address that has been verified to deliver. `null` when
   * status is `auto_crawl`, `gated_portal`, or `channel_dead`.
   */
  primaryEmail: string | null
  /** Optional cc address that has also been verified */
  ccEmail?: string
  /** ISO date — when we last confirmed deliverability of `primaryEmail` */
  lastVerifiedAt: string
  /**
   * Addresses that bounced in the past. Don't use them; here so we don't
   * accidentally re-add them on a future "let's resend" pass.
   */
  bouncedAddresses?: string[]
  /** Plain-English instructions shown on /feeds — partner-facing playbook */
  instructions: string
  /** Internal note: anything we should remember next time we revisit */
  note?: string
}

export const PARTNER_CONTACTS: Record<SyndicationTargetId | 'sitemap', PartnerContact> = {
  indeed: {
    target: 'indeed',
    status: 'auto_crawl',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      "No submission needed — Indeed retired the public XML feed onboarding. Their crawler auto-picks up the JobPosting JSON-LD we emit on each /jobs/[slug] page. For sponsored / explicit ingestion, contact your Indeed account rep.",
  },
  ziprecruiter: {
    target: 'ziprecruiter',
    status: 'email_active',
    primaryEmail: 'support@ziprecruiter.com',
    lastVerifiedAt: '2026-04-30',
    bouncedAddresses: ['partners@ziprecruiter.com'],
    instructions:
      'Email support@ziprecruiter.com with the feed URL — the general support inbox routes to the publisher partnerships team.',
    note:
      'Direct partners@ziprecruiter.com bounces 550 5.1.1. The publisher signup at ziprecruiter.com/publishers is wrapped in Cloudflare bot detection — sales call may be needed if email goes ignored.',
  },
  glassdoor: {
    target: 'glassdoor',
    status: 'auto_crawl',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      'Glassdoor is Indeed-owned — same pipeline as Indeed (passive auto-crawl). For explicit listings, ask your Indeed account rep.',
  },
  linkedin: {
    target: 'linkedin',
    status: 'gated_portal',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      'Job Wrapping is gated. Requires (1) a LinkedIn Company Page for freejobpost.co (created at linkedin.com/company/freejobpost) and (2) a LinkedIn Talent Solutions rep to whitelist the feed URL. Contact your rep when ready.',
  },
  google: {
    target: 'google',
    status: 'auto_crawl',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      'No submission needed — Google crawls each /jobs/[slug] page directly and reads the JobPosting JSON-LD. Submit /sitemap.xml to Google Search Console for crawl discovery (done 2026-04-29). Bing Webmaster Tools imports from GSC automatically (done 2026-04-29).',
  },
  adzuna: {
    target: 'adzuna',
    status: 'email_active',
    primaryEmail: 'content@adzuna.com',
    ccEmail: 'support@adzuna.com',
    lastVerifiedAt: '2026-04-30',
    instructions:
      'Email content@adzuna.com with the feed URL (cc support@adzuna.com).',
    note:
      'Delivered 2026-04-29 and Matt Woodbridge (Product Manager) replied within 24h asking for relationship + sourcing details. Adzuna retired their public partners.html submission form; the content team handles intake informally.',
  },
  jooble: {
    target: 'jooble',
    status: 'email_active',
    primaryEmail: 'support@jooble.com',
    lastVerifiedAt: '2026-04-30',
    bouncedAddresses: ['partners@jooble.com'],
    instructions:
      'Email support@jooble.com with the feed URL — the support inbox forwards to the partnerships team.',
    note:
      'Direct partners@jooble.com bounces 550 5.1.1. Fallback if no reply: book a call at uk.jooble.org/partner/for-publishers (Calendly-style "Book a call" CTA).',
  },
  talent: {
    target: 'talent',
    status: 'channel_dead',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    bouncedAddresses: ['partner@talent.com', 'partners@talent.com'],
    instructions:
      "No public email channel — both partner@talent.com and partners@talent.com bounce. The publisher portal at talent.com/publishers is invite-only. Path forward: LinkedIn outreach to a Talent.com employee (Sales / Partnerships) or skip — Talent.com is the lowest-volume of the four major aggregators.",
  },
  rss: {
    target: 'rss',
    status: 'auto_crawl',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      'No submission needed — Apple News, Feedly, Inoreader, Reddit RSS bots, and most niche aggregators auto-discover via the <link rel="alternate"> tag and direct URL.',
  },
  sitemap: {
    target: 'sitemap',
    status: 'auto_crawl',
    primaryEmail: null,
    lastVerifiedAt: '2026-04-30',
    instructions:
      'Google Search Console → Sitemaps → Add /sitemap.xml. Bing Webmaster Tools accepts the same URL.',
  },
}

/**
 * Returns true if every email-channel contact in the registry was verified
 * within the last 90 days. Used by an upcoming health-check job to flag
 * stale contacts before they bounce silently like 2026-04-29.
 */
export function partnerContactsAreFresh(now: Date = new Date()): boolean {
  const cutoff = now.getTime() - 90 * 86400_000
  return Object.values(PARTNER_CONTACTS)
    .filter((c) => c.status === 'email_active')
    .every((c) => new Date(c.lastVerifiedAt).getTime() > cutoff)
}
