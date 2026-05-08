import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstileToken } from './turnstile'

// These tests pin the security-critical paths in verifyTurnstileToken.
// Most-likely regressions:
//   1. Someone removes the fail-open path → all forms break in prod when CF
//      siteverify has a hiccup.
//   2. Someone changes the < 20 char token check → spoofed empty tokens
//      leak through to the RPC layer.
//   3. Someone changes the 'reason' strings → friendly UX disappears.
//
// Pattern: stub global.fetch in beforeEach, restore in afterEach. Tests
// that don't hit network just assert on the early-return paths.

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY

beforeEach(() => {
  // Default to a configured secret; individual tests can override.
  process.env.TURNSTILE_SECRET_KEY = 'test-secret-not-real'
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  if (ORIGINAL_SECRET == null) {
    delete process.env.TURNSTILE_SECRET_KEY
  } else {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET
  }
  vi.restoreAllMocks()
})

describe('verifyTurnstileToken — fail-open posture', () => {
  it('returns ok:true configured:false when TURNSTILE_SECRET_KEY is unset', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const result = await verifyTurnstileToken('any-token-value-doesnt-matter')
    expect(result).toEqual({ ok: true, configured: false })
  })

  it('does not call Cloudflare when fail-open path triggers', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    await verifyTurnstileToken('some-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('verifyTurnstileToken — input validation (when configured)', () => {
  it('rejects null token', async () => {
    const r = await verifyTurnstileToken(null)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errorCodes).toContain('missing-input-response')
      expect(r.reason).toMatch(/missing|malformed/i)
    }
  })

  it('rejects undefined token', async () => {
    const r = await verifyTurnstileToken(undefined)
    expect(r.ok).toBe(false)
  })

  it('rejects empty-string token', async () => {
    const r = await verifyTurnstileToken('')
    expect(r.ok).toBe(false)
  })

  it('rejects token shorter than 20 chars (Cloudflare tokens are ~600+)', async () => {
    const r = await verifyTurnstileToken('short')
    expect(r.ok).toBe(false)
  })

  it('does not call Cloudflare for invalid input', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    await verifyTurnstileToken('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('verifyTurnstileToken — Cloudflare success path', () => {
  it('returns ok:true with hostname + action when siteverify succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        hostname: 'freejobpost.co',
        action: 'post-job',
        challenge_ts: '2026-05-08T00:00:00Z',
      }),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50), '203.0.113.1')
    expect(r).toEqual({
      ok: true,
      configured: true,
      hostname: 'freejobpost.co',
      action: 'post-job',
    })
  })

  it('passes the remoteIp through to siteverify when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await verifyTurnstileToken('a'.repeat(50), '203.0.113.1')
    const body = fetchMock.mock.calls[0][1]?.body as string
    expect(body).toContain('remoteip=203.0.113.1')
  })
})

describe('verifyTurnstileToken — Cloudflare failure paths', () => {
  it('returns user-friendly reason for timeout-or-duplicate', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        'error-codes': ['timeout-or-duplicate'],
      }),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errorCodes).toContain('timeout-or-duplicate')
      expect(r.reason).toMatch(/expired|already used/i)
    }
  })

  it('returns user-friendly reason for invalid-input-response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/invalid/i)
    }
  })

  it('returns server-misconfig reason for invalid-input-secret (operator error)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-secret'],
      }),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/server.*misconfig/i)
    }
  })

  it('returns generic fallback for unknown error codes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        'error-codes': ['some-future-error-code'],
      }),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toMatch(/Bot challenge failed|refresh/i)
    }
  })
})

describe('verifyTurnstileToken — network failure paths (fail-open posture)', () => {
  it('returns ok:true on fetch network error (CF infra down → forms still work)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const r = await verifyTurnstileToken('a'.repeat(50))
    // Same posture as SES sandbox guard — transient infra failure shouldn't
    // lock all submissions.
    expect(r.ok).toBe(true)
    expect((r as { configured: boolean }).configured).toBe(true)
  })

  it('returns ok:true on non-2xx HTTP response (CF returning 5xx etc.)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response)
    const r = await verifyTurnstileToken('a'.repeat(50))
    expect(r.ok).toBe(true)
  })
})
