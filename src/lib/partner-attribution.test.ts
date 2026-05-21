import { describe, expect, it } from 'vitest'
import {
  normalizePartner,
  isAllowedPartner,
  ALL_PARTNERS,
} from './partner-attribution'

describe('normalizePartner', () => {
  it('defaults to internal when raw is null/undefined/empty', () => {
    expect(normalizePartner(null)).toBe('internal')
    expect(normalizePartner(undefined)).toBe('internal')
    expect(normalizePartner('')).toBe('internal')
  })

  it('accepts known partner keys', () => {
    expect(normalizePartner('talent')).toBe('talent')
    expect(normalizePartner('adzuna')).toBe('adzuna')
    expect(normalizePartner('jooble')).toBe('jooble')
    expect(normalizePartner('careerjet')).toBe('careerjet')
    expect(normalizePartner('glassdoor')).toBe('glassdoor')
    expect(normalizePartner('ziprecruiter')).toBe('ziprecruiter')
    expect(normalizePartner('linkedin')).toBe('linkedin')
    expect(normalizePartner('indeed')).toBe('indeed')
    expect(normalizePartner('monster')).toBe('monster')
    expect(normalizePartner('simplyhired')).toBe('simplyhired')
    expect(normalizePartner('rss')).toBe('rss')
    expect(normalizePartner('google')).toBe('google')
    expect(normalizePartner('internal')).toBe('internal')
  })

  it('lowercases mixed-case input before matching', () => {
    expect(normalizePartner('TALENT')).toBe('talent')
    expect(normalizePartner('Adzuna')).toBe('adzuna')
    expect(normalizePartner('JoOblE')).toBe('jooble')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizePartner('  talent  ')).toBe('talent')
    expect(normalizePartner('\tjooble\n')).toBe('jooble')
  })

  it('collapses unknown partner strings to internal (anti-pollution)', () => {
    // Pre-2026-05-21 audit: /jobs/[slug] accepted ANY [a-z0-9-]+ string,
    // letting a malicious or careless ?ref=evilpartner123 pollute
    // apply_clicks. The allowlist forces unknown values to collapse.
    expect(normalizePartner('evilpartner123')).toBe('internal')
    expect(normalizePartner('tracking-pixel')).toBe('internal')
    expect(normalizePartner('unknownsource')).toBe('internal')
  })

  it('collapses XSS-style inputs to internal', () => {
    expect(normalizePartner('<script>alert(1)</script>')).toBe('internal')
    expect(normalizePartner('../../etc/passwd')).toBe('internal')
    expect(normalizePartner('javascript:void(0)')).toBe('internal')
  })

  it('length-caps before allowlist check', () => {
    // A 1000-char value, even if it starts with "talent", should not match.
    const long = 'talent' + 'x'.repeat(1000)
    expect(normalizePartner(long)).toBe('internal')
  })
})

describe('isAllowedPartner', () => {
  it('returns true for every member of ALL_PARTNERS', () => {
    for (const p of ALL_PARTNERS) {
      expect(isAllowedPartner(p)).toBe(true)
    }
  })

  it('returns false for non-allowlist strings', () => {
    expect(isAllowedPartner('Talent')).toBe(false) // case-sensitive
    expect(isAllowedPartner('unknown')).toBe(false)
    expect(isAllowedPartner('')).toBe(false)
  })
})

describe('ALL_PARTNERS', () => {
  it('contains exactly 13 known partners', () => {
    // Bump this count + add to the allowlist when introducing a new
    // partner-attribution source.
    expect(ALL_PARTNERS).toHaveLength(13)
  })

  it('includes both syndication-target keys AND scraper-attribution keys', () => {
    // SyndicationTargetId-aligned (publisher feeds we own):
    expect(ALL_PARTNERS).toContain('talent')
    expect(ALL_PARTNERS).toContain('careerjet')
    // Scraper / external surfaces (no feed deal, but they attribute):
    expect(ALL_PARTNERS).toContain('monster')
    expect(ALL_PARTNERS).toContain('simplyhired')
    expect(ALL_PARTNERS).toContain('google')
    // Internal-traffic baseline:
    expect(ALL_PARTNERS).toContain('internal')
  })
})
