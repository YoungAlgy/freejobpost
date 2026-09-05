import { describe, expect, it, vi } from 'vitest'
import { employerJobStatus, markJobFilled } from './employer-dashboard'

const now = Date.parse('2026-09-05T12:00:00Z')

describe('employer job display state', () => {
  it.each(['active', 'pending_review'])('preserves an unexpired %s state', (status) => {
    expect(employerJobStatus({ status, expires_at: '2026-09-06T12:00:00Z' }, now)).toBe(status)
  })
  it.each(['active', 'pending_review'])('expires %s at the exact cutoff', (status) => {
    expect(employerJobStatus({ status, expires_at: '2026-09-05T12:00:00Z' }, now)).toBe('expired')
  })
  it.each(['filled', 'expired', 'spam', 'archived'])('preserves explicit %s state', (status) => {
    expect(employerJobStatus({ status, expires_at: '2026-09-06T12:00:00Z' }, now)).toBe(status)
  })
  it('never labels a job with an invalid expiry live', () => {
    expect(employerJobStatus({ status: 'active', expires_at: 'bad-date' }, now)).toBe('unavailable')
  })
})

describe('mark filled result', () => {
  it('accepts a confirmed result exactly once', async () => {
    const archive = vi.fn().mockResolvedValue({ success: true })
    expect(await markJobFilled(archive)).toEqual({ state: 'filled', message: 'Job marked filled.' })
    expect(archive).toHaveBeenCalledTimes(1)
  })
  it('keeps a returned rejection and permits an explicit retry', async () => {
    expect(await markJobFilled(async () => ({ success: false, error: 'Not signed in.' })))
      .toEqual({ state: 'rejected', message: 'Not signed in.' })
  })
  it('provides usable copy when a rejection has no explanation', async () => {
    expect(await markJobFilled(async () => ({ success: false })))
      .toEqual({ state: 'rejected', message: 'We could not mark this job filled. Try again.' })
  })
  it.each([
    undefined,
    null,
    {},
    { success: 'true' },
    { success: 1 },
  ])('keeps malformed acknowledgments unconfirmed: %j', async (response) => {
    const result = await markJobFilled(async () => response)
    expect(result.state).toBe('unknown')
    expect(result.message).toContain('Refresh this page to check the job status')
  })
  it('does not retry or claim failure after losing a response', async () => {
    const archive = vi.fn().mockRejectedValue(new Error('transport failed'))
    const result = await markJobFilled(archive)
    expect(result.state).toBe('unknown')
    expect(result.message).toContain('Refresh this page to check the job status')
    expect(archive).toHaveBeenCalledTimes(1)
  })
})
