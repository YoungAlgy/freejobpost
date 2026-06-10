import { describe, it, expect } from 'vitest'
import { sanitizeResumeUrl } from './sanitize-resume-url'

// The employer email renders this value as a clickable link, so the
// sanitizer is a security boundary: only plain http(s) URLs survive.
describe('sanitizeResumeUrl', () => {
  it('accepts normal https resume links', () => {
    expect(sanitizeResumeUrl('https://docs.google.com/document/d/abc123')).toBe(
      'https://docs.google.com/document/d/abc123',
    )
    expect(sanitizeResumeUrl('http://example.com/cv.pdf')).toBe('http://example.com/cv.pdf')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeResumeUrl('  https://example.com/cv.pdf  ')).toBe('https://example.com/cv.pdf')
  })

  it('degrades empty and missing input to null', () => {
    expect(sanitizeResumeUrl('')).toBeNull()
    expect(sanitizeResumeUrl('   ')).toBeNull()
    expect(sanitizeResumeUrl(null)).toBeNull()
    expect(sanitizeResumeUrl(undefined)).toBeNull()
  })

  it('rejects non-http(s) schemes', () => {
    expect(sanitizeResumeUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeResumeUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(sanitizeResumeUrl('ftp://example.com/cv.pdf')).toBeNull()
    expect(sanitizeResumeUrl('file:///C:/cv.pdf')).toBeNull()
  })

  it('rejects userinfo lookalike-host URLs (round-3 audit)', () => {
    expect(sanitizeResumeUrl('https://docs.google.com@evil.tld/cv.pdf')).toBeNull()
    expect(sanitizeResumeUrl('https://user:pass@evil.tld/cv.pdf')).toBeNull()
  })

  it('rejects things that are not URLs at all', () => {
    expect(sanitizeResumeUrl('www.dropbox.com/cv')).toBeNull()
    expect(sanitizeResumeUrl('my resume is attached')).toBeNull()
  })

  it('rejects absurd lengths', () => {
    expect(sanitizeResumeUrl('https://example.com/' + 'a'.repeat(500))).toBeNull()
  })

  it('does not mangle querystrings or fragments on valid URLs', () => {
    expect(sanitizeResumeUrl('https://example.com/cv?dl=1#page=2')).toBe(
      'https://example.com/cv?dl=1#page=2',
    )
  })
})
