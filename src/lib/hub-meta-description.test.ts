import { describe, expect, it } from 'vitest'
import { composeHubMetaDescription } from './hub-meta-description'

describe('composeHubMetaDescription', () => {
  it('uses the exact direct-employer count for state hubs', () => {
    expect(composeHubMetaDescription({ count: 1, label: 'Florida', kind: 'state' }))
      .toBe('1 active nursing or allied health job in Florida, posted directly by employers.')
    expect(composeHubMetaDescription({ count: 12, label: 'Florida', kind: 'state' }))
      .toBe('12 active nursing or allied health jobs in Florida, posted directly by employers.')
  })

  it('uses honest zero-inventory copy without aggregate claims', () => {
    const out = composeHubMetaDescription({ count: 0, label: 'Wyoming', kind: 'state' })
    expect(out).toContain('No active nursing or allied health jobs in Wyoming')
    expect(out).toContain('direct employer posts')
    expect(out).not.toContain('thousands')
  })

  it('normalizes the Jobs suffix in specialty labels', () => {
    expect(composeHubMetaDescription({ count: 1, label: 'Cardiology Jobs', kind: 'specialty' }))
      .toBe('1 active cardiology job, posted directly by employers.')
  })

  it('treats invalid and negative counts as zero', () => {
    expect(composeHubMetaDescription({ count: Number.NaN, label: 'CRNA Jobs', kind: 'specialty' }))
      .toContain('No active crna jobs')
    expect(composeHubMetaDescription({ count: -3, label: 'Texas', kind: 'state' }))
      .toContain('No active nursing or allied health jobs in Texas')
  })
})
