import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { settleEmployerLogin } from './employer-login-result'

describe('settleEmployerLogin', () => {
  it('preserves accepted and expected rejection results', async () => {
    await expect(settleEmployerLogin(async () => ({ success: true })))
      .resolves.toEqual({ success: true })
    await expect(settleEmployerLogin(async () => ({ success: false, error: 'Try later.' })))
      .resolves.toEqual({ success: false, error: 'Try later.' })
  })

  it('recovers from a thrown request without exposing details or resending', async () => {
    const request = vi.fn(async () => { throw new Error('internal transport details') })
    await expect(settleEmployerLogin(request)).resolves.toEqual({
      success: false,
      error: 'We could not confirm the email was sent. Check your inbox before trying again.',
    })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([null, undefined, {}, { success: false }, { success: false, error: '' }, { success: false, error: '  ' }, { success: 'true' }])(
    'returns useful uncertainty copy for incomplete result %j',
    async (response) => {
      await expect(settleEmployerLogin(async () => response)).resolves.toEqual({
        success: false,
        error: 'We could not confirm the email was sent. Check your inbox before trying again.',
      })
    },
  )

  it('waits for a pending request instead of retrying or claiming a timeout', async () => {
    let complete!: (result: { success: boolean }) => void
    const request = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { complete = resolve }))
    const settled = vi.fn()
    const result = settleEmployerLogin(request).then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    complete({ success: true })
    await result
    expect(settled).toHaveBeenCalledWith({ success: true })
  })

  it('guards pending input and submission and uses the recovered result in the form', () => {
    const form = readFileSync(resolve(process.cwd(), 'src/app/employer/login/login-form.tsx'), 'utf8')
      .replace(/\r\n/g, '\n')
    expect(form).toContain('settleEmployerLogin(')
    expect(form).toContain('if (submissionRef.current || pending || !verificationReady) return')
    const emailInput = form.match(/<input\s+type="email"[\s\S]*?\/>/)?.[0]
    expect(emailInput).toContain('disabled={pending}')
    expect(form).toContain('isTurnstileReady(verificationConfigured, turnstileToken)')
    expect(form).toContain('turnstileResultStatus(verificationConfigured, token)')
  })

  it('keeps the returned employer email breakable in the accepted state', () => {
    const form = readFileSync(resolve(process.cwd(), 'src/app/employer/login/login-form.tsx'), 'utf8')
    expect(form).toContain('<strong className="break-all">{email}</strong>')
    expect(form).toContain('receive a sign-in link. Open it to view your dashboard.')
    expect(form).not.toContain('receive a sign-in link in the next minute')
  })
})
