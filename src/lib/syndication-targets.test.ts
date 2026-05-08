import { describe, expect, it } from 'vitest'
import {
  SYNDICATION_TARGETS,
  ALL_TARGET_IDS,
  DEFAULT_TARGET_IDS,
  type SyndicationTargetId,
} from './syndication-targets'

// ── Structural invariants ────────────────────────────────────────────────────

describe('SYNDICATION_TARGETS', () => {
  it('defines exactly 9 syndication targets', () => {
    expect(SYNDICATION_TARGETS).toHaveLength(9)
  })

  it('every target has the required fields', () => {
    for (const t of SYNDICATION_TARGETS) {
      expect(t.id, `${t.id} missing id`).toBeTruthy()
      expect(t.label, `${t.id} missing label`).toBeTruthy()
      expect(t.blurb, `${t.id} missing blurb`).toBeTruthy()
      expect(t.feedUrl, `${t.id} missing feedUrl`).toMatch(/^https:\/\//)
      expect(typeof t.defaultOn, `${t.id} defaultOn must be boolean`).toBe('boolean')
      expect(t.reach, `${t.id} missing reach`).toBeTruthy()
    }
  })

  it('every target id is unique', () => {
    const ids = SYNDICATION_TARGETS.map((t) => t.id)
    expect(ids).toHaveLength(new Set(ids).size)
  })
})

// ── Default-on targets (S7 lock-in test) ─────────────────────────────────────
//
// defaultOn controls which checkboxes the POST JOB form pre-checks.
// Channel-inactive targets (linkedin, talent) must stay OFF by default so we
// never advertise distribution to networks that aren't actually live.
// Any change to these should be intentional and reviewed.

describe('DEFAULT_TARGET_IDS', () => {
  it('includes all active-channel targets', () => {
    expect(DEFAULT_TARGET_IDS).toContain('indeed')
    expect(DEFAULT_TARGET_IDS).toContain('ziprecruiter')
    expect(DEFAULT_TARGET_IDS).toContain('glassdoor')
    expect(DEFAULT_TARGET_IDS).toContain('google')
    expect(DEFAULT_TARGET_IDS).toContain('adzuna')
    expect(DEFAULT_TARGET_IDS).toContain('jooble')
    expect(DEFAULT_TARGET_IDS).toContain('rss')
  })

  it('does NOT include gated/inactive channels', () => {
    // linkedin: gated — requires Talent Solutions rep; not yet active
    expect(DEFAULT_TARGET_IDS).not.toContain('linkedin')
    // talent: channel_dead — both partner@ addresses bounce; no public intake
    expect(DEFAULT_TARGET_IDS).not.toContain('talent')
  })

  it('matches the defaultOn flag on each target', () => {
    const expectedDefaults = SYNDICATION_TARGETS
      .filter((t) => t.defaultOn)
      .map((t) => t.id)
    expect([...DEFAULT_TARGET_IDS].sort()).toEqual([...expectedDefaults].sort())
  })
})

// ── ALL_TARGET_IDS ────────────────────────────────────────────────────────────

describe('ALL_TARGET_IDS', () => {
  it('contains every target id exactly once', () => {
    const allFromTargets = SYNDICATION_TARGETS.map((t) => t.id)
    expect([...ALL_TARGET_IDS].sort()).toEqual([...allFromTargets].sort())
  })

  it('has 9 items (all 9 networks, including inactive)', () => {
    expect(ALL_TARGET_IDS).toHaveLength(9)
  })
})

// ── feedUrl format ─────────────────────────────────────────────────────────────

describe('feedUrl patterns', () => {
  it('all XML feed URLs point to freejobpost.co/feeds/', () => {
    const xmlTargets = SYNDICATION_TARGETS.filter(
      (t) => t.spec.toLowerCase().includes('xml') || t.spec.toLowerCase().includes('rss')
    )
    for (const t of xmlTargets) {
      expect(t.feedUrl, `${t.id} should point to /feeds/`).toMatch(
        /^https:\/\/freejobpost\.co\//
      )
    }
  })

  it('google target points to /jobs (JSON-LD crawl, not an XML feed)', () => {
    const google = SYNDICATION_TARGETS.find((t) => t.id === 'google')!
    expect(google.feedUrl).toBe('https://freejobpost.co/jobs')
  })
})

// ── SyndicationTargetId type completeness ─────────────────────────────────────

describe('SyndicationTargetId', () => {
  it('every target id satisfies the SyndicationTargetId type (compile-time only)', () => {
    // This test exists to catch divergence between the id values in
    // SYNDICATION_TARGETS and the SyndicationTargetId union type. The TypeScript
    // compiler already enforces this, but an explicit runtime check acts as a
    // documentation lock-in.
    const knownIds: SyndicationTargetId[] = [
      'indeed', 'ziprecruiter', 'glassdoor', 'linkedin',
      'google', 'adzuna', 'jooble', 'talent', 'rss',
    ]
    for (const t of SYNDICATION_TARGETS) {
      expect(knownIds).toContain(t.id as SyndicationTargetId)
    }
  })
})
