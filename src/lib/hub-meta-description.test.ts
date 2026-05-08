import { describe, expect, it } from 'vitest'
import { composeHubMetaDescription } from './hub-meta-description'

const STATIC_STATE = 'Free Florida healthcare jobs — Tampa, Miami, Jacksonville. Physician, NP, PA, RN, CRNA roles.'
const STATIC_SPECIALTY = 'Free cardiology jobs — interventional, EP, structural, general. Browse open roles.'

describe('composeHubMetaDescription', () => {
  it('returns the static description when count >= 3 (healthy inventory)', () => {
    expect(
      composeHubMetaDescription({
        count: 3,
        staticDescription: STATIC_STATE,
        label: 'Florida',
        kind: 'state',
      })
    ).toBe(STATIC_STATE)
    expect(
      composeHubMetaDescription({
        count: 50,
        staticDescription: STATIC_STATE,
        label: 'Florida',
        kind: 'state',
      })
    ).toBe(STATIC_STATE)
  })

  it('returns the empty-state copy for state hubs at count = 0', () => {
    const out = composeHubMetaDescription({
      count: 0,
      staticDescription: STATIC_STATE,
      label: 'Wyoming',
      kind: 'state',
    })
    expect(out).toContain('No active Wyoming healthcare jobs')
    expect(out).not.toBe(STATIC_STATE)
  })

  it('returns the empty-state copy for specialty hubs at count = 0', () => {
    const out = composeHubMetaDescription({
      count: 0,
      staticDescription: STATIC_SPECIALTY,
      label: 'Cardiology Jobs',
      kind: 'specialty',
    })
    expect(out).toContain('No active cardiology jobs')
    expect(out).not.toBe(STATIC_SPECIALTY)
  })

  it('uses singular role-noun for count = 1 in state copy', () => {
    const out = composeHubMetaDescription({
      count: 1,
      staticDescription: STATIC_STATE,
      label: 'Florida',
      kind: 'state',
    })
    expect(out).toContain('1 active healthcare role in Florida')
    expect(out).not.toContain('roles in Florida')
  })

  it('uses plural role-noun for count = 2 in state copy', () => {
    const out = composeHubMetaDescription({
      count: 2,
      staticDescription: STATIC_STATE,
      label: 'Florida',
      kind: 'state',
    })
    expect(out).toContain('2 active healthcare roles in Florida')
  })

  it('strips " jobs" suffix from specialty label in sparse copy (case "Cardiology Jobs" → "cardiology")', () => {
    const out = composeHubMetaDescription({
      count: 1,
      staticDescription: STATIC_SPECIALTY,
      label: 'Cardiology Jobs',
      kind: 'specialty',
    })
    // Expect the label to read naturally — no awkward "1 cardiology jobs role"
    expect(out.toLowerCase()).toContain('cardiology')
    expect(out).not.toContain('jobs role')
  })

  it('threshold is exactly 3 — count = 2 is sparse, count = 3 is healthy', () => {
    const at2 = composeHubMetaDescription({
      count: 2,
      staticDescription: STATIC_STATE,
      label: 'Wyoming',
      kind: 'state',
    })
    const at3 = composeHubMetaDescription({
      count: 3,
      staticDescription: STATIC_STATE,
      label: 'Wyoming',
      kind: 'state',
    })
    expect(at2).not.toBe(STATIC_STATE)
    expect(at3).toBe(STATIC_STATE)
  })

  it('honest sparse copy points to broader board', () => {
    const out = composeHubMetaDescription({
      count: 1,
      staticDescription: STATIC_STATE,
      label: 'Florida',
      kind: 'state',
    })
    expect(out.toLowerCase()).toMatch(/all open us|see all|more options/)
  })
})
