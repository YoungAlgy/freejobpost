import { describe, expect, it } from 'vitest'
import { normalizePartner } from './partner-attribution'

// Known partner keys, mirrored here so this file can assert allowlist
// membership/shape without partner-attribution.ts needing to export the
// allowlist itself. Bump/edit alongside PARTNER_ALLOWLIST in that file
// when introducing a new partner-attribution source.
const KNOWN_PARTNERS = [
  'internal',
  'talent',
  'adzuna',
  'jooble',
  'careerjet',
  'glassdoor',
  'ziprecruiter',
  'linkedin',
  'indeed',
  'monster',
  'simplyhired',
  'rss',
  'google',
]

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

describe('normalizePartner allowlist shape', () => {
  it('round-trips every known partner key unchanged', () => {
    // If PARTNER_ALLOWLIST in partner-attribution.ts ever drops one of
    // these, normalizePartner would collapse it to 'internal' and this
    // assertion would catch the drift.
    for (const p of KNOWN_PARTNERS) {
      expect(normalizePartner(p)).toBe(p)
    }
  })

  it('contains exactly 13 known partners', () => {
    // Bump this count + KNOWN_PARTNERS above (and PARTNER_ALLOWLIST in
    // partner-attribution.ts) when introducing a new attribution source.
    expect(KNOWN_PARTNERS).toHaveLength(13)
  })
})
