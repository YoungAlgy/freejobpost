import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { isTurnstileReady, turnstileResultStatus } from './form-verification'

describe('form verification readiness', () => {
  it('keeps local no-config empty success usable', () => {
    expect(isTurnstileReady(false, null)).toBe(true)
    expect(turnstileResultStatus(false, '')).toBe('ready')
  })

  it('rejects empty configured success and accepts a real configured token', () => {
    expect(isTurnstileReady(true, null)).toBe(false)
    expect(turnstileResultStatus(true, '')).toBe('failed')
    expect(turnstileResultStatus(true, 'verified')).toBe('ready')
  })

  it('wires configured readiness and retry without clearing the job fields', async () => {
    const source = await readFile(new URL('../app/post-job/post-job-form.tsx', import.meta.url), 'utf8')
    const retry = source.slice(source.indexOf('const retryTurnstile'), source.indexOf('const onSubmit'))
    const backLabel = source.indexOf('← Back')
    const backHandler = source.slice(source.lastIndexOf('onClick={() => {', backLabel), backLabel)
    expect(source).toContain('isTurnstileReady(turnstileConfigured, turnstileToken)')
    expect(source).toContain('settlePostJob(')
    expect(retry).toContain('setTurnstileToken(null)')
    expect(retry).toContain('setTurnstileKey')
    expect(retry).not.toContain('setValues')
    expect(backHandler).toContain('if (step === 3) retryTurnstile()')
  })

  it('locks the submitted contact details until the request settles', async () => {
    const source = await readFile(new URL('../app/post-job/post-job-form.tsx', import.meta.url), 'utf8')
    for (const field of ['company_name', 'company_url', 'contact_name', 'contact_email']) {
      const input = [...source.matchAll(/<input\b[\s\S]*?\/>/g)]
        .map((match) => match[0])
        .find((input) => input.includes(`value={values.${field}}`))
      expect(input, field).toContain('disabled={pending}')
    }
  })
})
