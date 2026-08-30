import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FREEJOBPOST_FROM_EMAIL_BINDING,
  FREEJOBPOST_REPLY_TO_EMAIL_BINDING,
  readFreeJobPostEmailConfig,
  requireFreeJobPostOwnedEmail,
} from '../../supabase/functions/_shared/freejobpost-email'

describe('FreeJobPost email configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('accepts monitored addresses owned by FreeJobPost', () => {
    expect(
      requireFreeJobPostOwnedEmail(
        ' Jobs@FreeJobPost.co ',
        FREEJOBPOST_FROM_EMAIL_BINDING,
      ),
    ).toBe('jobs@freejobpost.co')
    expect(
      requireFreeJobPostOwnedEmail(
        'Support@FreeJobPost.co',
        FREEJOBPOST_REPLY_TO_EMAIL_BINDING,
      ),
    ).toBe('support@freejobpost.co')
  })

  it('rejects missing, malformed, and cross-brand addresses', () => {
    for (const value of [
      undefined,
      '',
      'jobs@avahealth.co',
      'jobs@example.com',
      'support@mail.freejobpost.co',
      'not-an-email',
      '.jobs@freejobpost.co',
      'jobs.@freejobpost.co',
      'jobs..ops@freejobpost.co',
      'jobs@-mail.freejobpost.co',
      'jobs@mail-.freejobpost.co',
      `${'j'.repeat(65)}@freejobpost.co`,
    ]) {
      expect(() =>
        requireFreeJobPostOwnedEmail(value, FREEJOBPOST_FROM_EMAIL_BINDING),
      ).toThrow('must be a monitored email address on freejobpost.co')
    }
  })

  it('requires both Edge email bindings and does not substitute a fallback', () => {
    const values: Record<string, string> = {
      [FREEJOBPOST_FROM_EMAIL_BINDING]: 'mail@freejobpost.co',
      [FREEJOBPOST_REPLY_TO_EMAIL_BINDING]: 'support@freejobpost.co',
    }
    expect(readFreeJobPostEmailConfig((name) => values[name])).toEqual({
      fromEmail: 'mail@freejobpost.co',
      replyToEmail: 'support@freejobpost.co',
    })

    delete values[FREEJOBPOST_REPLY_TO_EMAIL_BINDING]
    expect(() => readFreeJobPostEmailConfig((name) => values[name])).toThrow(
      FREEJOBPOST_REPLY_TO_EMAIL_BINDING,
    )
  })

  it('loads the required public support binding when it is valid', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL',
      'support@freejobpost.co',
    )
    const config = await import('./freejobpost-email')
    expect(config.FREEJOBPOST_SUPPORT_EMAIL).toBe('support@freejobpost.co')
  })

  it('fails module loading when the public support binding is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL', '')
    await expect(import('./freejobpost-email')).rejects.toThrow(
      'NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL',
    )
  })

  it('fails module loading for a cross-brand public support address', async () => {
    vi.stubEnv('NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL', 'info@avahealth.co')
    await expect(import('./freejobpost-email')).rejects.toThrow(
      'NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL',
    )
  })
})
