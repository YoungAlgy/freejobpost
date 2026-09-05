import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { settlePostJob, UNCONFIRMED_POST_JOB } from './post-job-result'

describe('post-job submission result', () => {
  it('preserves a complete success and valid optional delivery flags', async () => {
    await expect(settlePostJob(async () => ({
      success: true,
      job_slug: 'critical-care-rn',
      already_submitted: false,
      verify_email_sent: true,
    }))).resolves.toEqual({
      success: true,
      job_slug: 'critical-care-rn',
      already_submitted: false,
      verify_email_sent: true,
    })
  })

  it('preserves an explicit rejection', async () => {
    await expect(settlePostJob(async () => ({ success: false, error: 'Try again later.' })))
      .resolves.toEqual({ success: false, error: 'Try again later.' })
  })

  it.each([
    [true, { success: true, job_slug: 'critical-care-rn', verify_email_sent: true }],
    [false, { success: true, job_slug: 'critical-care-rn', verify_email_sent: false }],
    [undefined, { success: true, job_slug: 'critical-care-rn' }],
  ])('preserves the valid verification-email outcome %j', async (verifyEmailSent, expected) => {
    const result = await settlePostJob(async () => ({
      success: true,
      job_slug: 'critical-care-rn',
      ...(verifyEmailSent === undefined ? {} : { verify_email_sent: verifyEmailSent }),
    }))
    expect(result).toEqual(expected)
  })

  it('drops malformed optional success flags', async () => {
    await expect(settlePostJob(async () => ({
      success: true,
      job_slug: 'critical-care-rn',
      already_submitted: 'false',
      verify_email_sent: 1,
    }))).resolves.toEqual({ success: true, job_slug: 'critical-care-rn' })
  })

  it.each([
    undefined,
    null,
    {},
    { success: 'true' },
    { success: true },
    { success: true, job_slug: '  ' },
    { success: false },
    { success: false, error: {} },
    { success: false, error: '  ' },
  ])('turns malformed acknowledgement %j into an unconfirmed outcome', async (response) => {
    await expect(settlePostJob(async () => response)).resolves.toEqual({
      success: false,
      error: UNCONFIRMED_POST_JOB,
    })
  })

  it('waits for the one pending request without resending', async () => {
    let finish!: (value: unknown) => void
    const request = vi.fn(() => new Promise<unknown>((resolve) => { finish = resolve }))
    let settled = false
    const pending = settlePostJob(request).then((value) => { settled = true; return value })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)

    finish({ success: false, error: 'Try again later.' })
    await expect(pending).resolves.toEqual({ success: false, error: 'Try again later.' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('renders distinct true, false, and unknown delivery branches after an accepted job', () => {
    const form = readFileSync(resolve(process.cwd(), 'src/app/post-job/post-job-form.tsx'), 'utf8')
    expect(form).toContain("result.verify_email_sent === true ? 'Check your email.' : 'One more step.'")
    expect(form).toContain("result.verify_email_sent === true ? (")
    expect(form).toContain('Your job is saved. We could not confirm the verification email. Check your inbox before posting again.')
    expect(form).toContain('{result.verify_email_sent === true && (')
  })
})
