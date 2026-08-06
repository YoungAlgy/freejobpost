import { describe, expect, it } from 'vitest'
import { PARTNER_CONTACTS } from './partner-contacts'

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

  it('entries with an active or in-flight email channel must have a valid primaryEmail; auto_crawl / gated / dead must have null', () => {
    // web_form_submitted entries can have either: a documented fallback
    // email (the address we'd use if the form route goes silent) or null
    // (no email path at all). Both are valid.
    for (const [key, contact] of Object.entries(PARTNER_CONTACTS)) {
      if (contact.status === 'email_active') {
        expect(contact.primaryEmail, `${key} should have primaryEmail`).not.toBe(null)
        expect(contact.primaryEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      } else if (contact.status === 'web_form_submitted') {
        // primaryEmail allowed to be either null or a valid fallback address
        if (contact.primaryEmail !== null) {
          expect(contact.primaryEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        }
      } else {
        expect(contact.primaryEmail, `${key} should not have primaryEmail`).toBe(null)
      }
    }
  })

  it('every status is one of the documented values', () => {
    const valid = new Set([
      'auto_crawl', 'email_active', 'gated_portal', 'channel_dead', 'web_form_submitted',
    ])
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
