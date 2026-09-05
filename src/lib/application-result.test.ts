import { describe, expect, it, vi } from 'vitest'
import { settleApplication } from './application-result'

describe('application submission result', () => {
  it('accepts a saved application with a reported notification', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, emails_sent: 1 })
    expect(await settleApplication(request)).toEqual({ state: 'submitted', notificationReported: true })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([0, undefined, null, -1, NaN, Infinity, '1'])('never turns accepted application with emails_sent=%s into a retry', async (emails_sent) => {
    expect(await settleApplication(async () => ({ success: true, emails_sent })))
      .toEqual({ state: 'submitted', notificationReported: false })
  })

  it('preserves an explicit rejection without guessing from its wording', async () => {
    expect(await settleApplication(async () => ({ success: false, error: 'Already applied.' })))
      .toEqual({ state: 'rejected', error: 'Already applied.' })
  })

  it.each([undefined, null, {}, 'ok', { success: 'true' }, { success: false }, { success: false, error: ' ' }])('treats malformed result %j as unconfirmed', async (value) => {
    const result = await settleApplication(async () => value)
    expect(result.state).toBe('unknown')
    if (result.state !== 'submitted') expect(result.error).toContain('Sending again could create a duplicate.')
  })

  it('catches an interrupted response without automatic resend', async () => {
    const request = vi.fn().mockRejectedValue(new Error('connection interrupted'))
    const result = await settleApplication(request)
    expect(result.state).toBe('unknown')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('waits for the original pending request instead of inventing a failure', async () => {
    let finish!: (value: unknown) => void
    const request = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    let settled = false
    const pending = settleApplication(request).then((value) => { settled = true; return value })
    await Promise.resolve()
    expect(settled).toBe(false)
    finish({ success: true, emails_sent: 0 })
    expect(await pending).toEqual({ state: 'submitted', notificationReported: false })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
