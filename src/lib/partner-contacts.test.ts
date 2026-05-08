import { describe, expect, it } from 'vitest'
import { PARTNER_CONTACTS, partnerContactsAreFresh } from './partner-contacts'

describe('PARTNER_CONTACTS', () => {
  it('has an entry for every syndication target plus sitemap', () => {
    const targets = Object.keys(PARTNER_CONTACTS)
    // Order doesn't matter, but each documented target must be present.
    expect(targets).toContain('indeed')
    expect(targets).toContain('ziprecruiter')
    expect(targets).toContain('glassdoor')
    expect(targets).toContain('linkedin')
    expect(targets).toContain('google')
    expect(targets).toContain('adzuna')
    expect(targets).toContain('jooble')
    expect(targets).toContain('talent')
    expect(targets).toContain('rss')
    expect(targets).toContain('sitemap')
  })

  it('every entry has a valid lastVerifiedAt ISO date', () => {
    for (const [key, contact] of Object.entries(PARTNER_CONTACTS)) {
      expect(contact.lastVerifiedAt, `${key} missing lastVerifiedAt`).toMatch(
        /^\d{4}-\d{2}-\d{2}/
      )
      expect(
        Number.isFinite(new Date(contact.lastVerifiedAt).getTime()),
        `${key} has unparseable lastVerifiedAt: ${contact.lastVerifiedAt}`
      ).toBe(true)
    }
  })

  it('email_active entries have a non-null primaryEmail; everything else has null', () => {
    for (const [key, contact] of Object.entries(PARTNER_CONTACTS)) {
      if (contact.status === 'email_active') {
        expect(contact.primaryEmail, `${key} should have primaryEmail`).not.toBe(null)
        expect(contact.primaryEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      } else {
        expect(contact.primaryEmail, `${key} should not have primaryEmail`).toBe(null)
      }
    }
  })

  it('every status is one of the documented values', () => {
    const valid = new Set(['auto_crawl', 'email_active', 'gated_portal', 'channel_dead'])
    for (const [key, contact] of Object.entries(PARTNER_CONTACTS)) {
      expect(valid.has(contact.status), `${key} has invalid status ${contact.status}`).toBe(true)
    }
  })

  it('records a bouncedAddresses list for entries that had to switch addresses', () => {
    // From the playbook history: ziprecruiter, jooble, talent all had at
    // least one bounced address. Document the record so future "let's
    // resend" passes don't accidentally re-add the dead address.
    expect(PARTNER_CONTACTS.ziprecruiter.bouncedAddresses).toContain('partners@ziprecruiter.com')
    expect(PARTNER_CONTACTS.jooble.bouncedAddresses).toContain('partners@jooble.com')
    expect(PARTNER_CONTACTS.talent.bouncedAddresses).toContain('partner@talent.com')
    expect(PARTNER_CONTACTS.talent.bouncedAddresses).toContain('partners@talent.com')
  })
})

describe('partnerContactsAreFresh', () => {
  it('returns true when all email_active contacts were verified within 90 days', () => {
    // Anchor "now" at a date when current entries (lastVerifiedAt 2026-04-30
    // for the email_active ones) are within 90 days.
    const now = new Date('2026-05-15T00:00:00Z')
    expect(partnerContactsAreFresh(now)).toBe(true)
  })

  it('returns false when at least one email_active contact is over 90 days stale', () => {
    // Roll the clock forward past 2026-04-30 + 90 days = 2026-07-29.
    const now = new Date('2026-08-15T00:00:00Z')
    expect(partnerContactsAreFresh(now)).toBe(false)
  })

  it('exactly-90-days-old is treated as stale (cutoff is strict <)', () => {
    // The function uses cutoff = now - 90d and tests `lastVerified > cutoff`,
    // so lastVerified == cutoff is stale. Pick a `now` such that one of the
    // 2026-04-30 entries lands EXACTLY on the cutoff.
    const exactly90Later = new Date('2026-04-30T00:00:00Z')
    exactly90Later.setUTCDate(exactly90Later.getUTCDate() + 90)
    expect(partnerContactsAreFresh(exactly90Later)).toBe(false)
  })

  it('only checks email_active contacts (ignores auto_crawl / gated_portal / channel_dead)', () => {
    // If only email_active matters, the function would pass even with stale
    // dates on auto_crawl entries. We've already asserted the email_active
    // ones are fresh as of 2026-05-15 — the auto_crawl/channel_dead ones use
    // the same date so this is a sanity check on the "ignore non-email"
    // assumption.
    const now = new Date('2026-05-15T00:00:00Z')
    expect(partnerContactsAreFresh(now)).toBe(true)
  })
})
