import { describe, expect, it } from 'vitest'
import { safeApplyUrl } from './safe-apply-url'

describe('safeApplyUrl', () => {
  it('normalizes ordinary employer URLs when HTTP compatibility is allowed', () => {
    expect(safeApplyUrl(' https://jobs.example.com/apply ')).toBe(
      'https://jobs.example.com/apply',
    )
    expect(safeApplyUrl('http://jobs.example.com/apply')).toBe(
      'http://jobs.example.com/apply',
    )
  })

  it('rejects userinfo URLs that can disguise the destination host', () => {
    expect(safeApplyUrl('https://trusted.example@evil.test/apply')).toBeNull()
    expect(safeApplyUrl('https://user:password@evil.test/apply')).toBeNull()
  })

  it('rejects non-HTTP protocols and malformed values', () => {
    expect(safeApplyUrl('javascript:alert(1)')).toBeNull()
    expect(safeApplyUrl('data:text/html,<p>bad</p>')).toBeNull()
    expect(safeApplyUrl('not a URL')).toBeNull()
    expect(safeApplyUrl(null)).toBeNull()
  })

  it('rejects IP literals, numeric host lookalikes, and oversized values', () => {
    expect(safeApplyUrl('https://127.0.0.1/apply', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://999.999.999.999/apply', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://0x7f000001/apply', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://0x7f.0.0.1/apply', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://[::1]/apply', { requireHttps: true })).toBeNull()
    expect(
      safeApplyUrl(`https://jobs.example.com/${'a'.repeat(500)}`, { requireHttps: true }),
    ).toBeNull()
    expect(
      safeApplyUrl(`https://jobs.example.com/${'😀'.repeat(100)}`, { requireHttps: true }),
    ).toBeNull()
  })

  it('can require HTTPS for the native apply flow', () => {
    expect(safeApplyUrl('https://jobs.example.com/apply', { requireHttps: true })).toBe(
      'https://jobs.example.com/apply',
    )
    expect(safeApplyUrl('http://jobs.example.com/apply', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://', { requireHttps: true })).toBeNull()
    expect(safeApplyUrl('https://user:password@evil.test', { requireHttps: true })).toBeNull()
  })
})
