import { describe, expect, it } from 'vitest'
import {
  cdata,
  jobUrlWithUtm,
  rfc822,
  indeedJobType,
  descriptionHtml,
} from './feed-builders'
import type { PublicJob } from './public-jobs'

describe('cdata', () => {
  it('wraps content in CDATA brackets', () => {
    expect(cdata('hello')).toBe('<![CDATA[hello]]>')
  })

  it('escapes ]]> sequences (CDATA-breakout protection)', () => {
    // A recruiter who posts a job description containing literal "]]>" could
    // close our CDATA early and inject XML elements into the aggregator
    // feed. cdata() splits any embedded "]]>" into "]]]]><![CDATA[>" so the
    // payload becomes inert. This test asserts the escape works on a payload
    // designed to break a naive CDATA wrapper.
    const evil = 'foo]]><script>alert(1)</script>bar'
    const out = cdata(evil)
    // Should not contain a raw "]]>" followed by a tag
    expect(out).not.toMatch(/]]>\s*<script/)
    // Should preserve the round-trip after the canonical CDATA reader
    // collapses the splice marker. Verify by checking the splice marker
    // appears at the right offset.
    expect(out).toContain(']]]]><![CDATA[>')
  })

  it('handles null + undefined gracefully', () => {
    expect(cdata(null)).toBe('<![CDATA[]]>')
    expect(cdata(undefined)).toBe('<![CDATA[]]>')
    expect(cdata('')).toBe('<![CDATA[]]>')
  })
})

describe('jobUrlWithUtm', () => {
  it('builds the canonical URL with both ?ref and UTM params for attribution', () => {
    // jobUrlWithUtm emits BOTH ?ref=<partner> (the apply_clicks attribution param read by
    // /jobs/[slug]) AND the utm_* params (Vercel Analytics + external UTM consumers).
    // ?ref was added 2026-05-19 in commit b3cf15e — both params live on the same URL.
    expect(jobUrlWithUtm('cardiology-md-tampa', 'indeed')).toBe(
      'https://freejobpost.co/jobs/cardiology-md-tampa?ref=indeed&utm_source=indeed&utm_medium=feed&utm_campaign=syndication'
    )
  })

  it('uses the right utm_source per network', () => {
    expect(jobUrlWithUtm('x', 'ziprecruiter')).toContain('utm_source=ziprecruiter')
    expect(jobUrlWithUtm('x', 'adzuna')).toContain('utm_source=adzuna')
    expect(jobUrlWithUtm('x', 'jooble')).toContain('utm_source=jooble')
    expect(jobUrlWithUtm('x', 'rss')).toContain('utm_source=rss')
  })

  it('utm_medium and utm_campaign are stable for analytics segmentation', () => {
    const url = jobUrlWithUtm('any-slug', 'indeed')
    expect(url).toContain('utm_medium=feed')
    expect(url).toContain('utm_campaign=syndication')
  })
})

describe('rfc822', () => {
  it('formats Date as RFC-822 (the spec the IndeedXML format requires)', () => {
    const d = new Date('2026-05-08T12:34:56Z')
    expect(rfc822(d)).toMatch(/^Fri, 08 May 2026 12:34:56 GMT$/)
  })
})

describe('indeedJobType', () => {
  it('maps each employment-type code to the indeed-spec value', () => {
    expect(indeedJobType('full_time')).toBe('fulltime')
    expect(indeedJobType('part_time')).toBe('parttime')
    expect(indeedJobType('contract')).toBe('contract')
    expect(indeedJobType('locum')).toBe('temporary')
    expect(indeedJobType('per_diem')).toBe('temporary')
    expect(indeedJobType('internship')).toBe('internship')
  })

  it('defaults to fulltime when type is null', () => {
    expect(indeedJobType(null)).toBe('fulltime')
  })
})

describe('descriptionHtml', () => {
  const baseJob = (description: string): PublicJob =>
    ({
      id: 'x',
      slug: 'x',
      title: 'X',
      description,
      role: null,
      specialty: null,
      vertical: 'healthcare',
      city: null,
      state: null,
      remote_hybrid: null,
      employment_type: null,
      salary_min: null,
      salary_max: null,
      experience_required: null,
      apply_url: null,
      source: null,
      created_at: '',
      expires_at: '',
      employer_id: null,
    }) as PublicJob

  it('wraps each blank-line-separated paragraph in <p>', () => {
    const out = descriptionHtml(baseJob('First paragraph.\n\nSecond paragraph.'))
    expect(out).toBe('<p>First paragraph.</p><p>Second paragraph.</p>')
  })

  it('escapes raw HTML characters BEFORE markdown substitution (XSS-safe)', () => {
    const out = descriptionHtml(baseJob('<script>alert(1)</script>'))
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('renders **bold** as <strong>bold</strong>', () => {
    const out = descriptionHtml(baseJob('This is **important** info.'))
    expect(out).toContain('<strong>important</strong>')
  })

  it('escape-then-substitute order means injected HTML cannot escape via **', () => {
    // **<script>alert(1)</script>** is escaped first to **&lt;script&gt;...**,
    // then bold-substituted to <strong>&lt;script&gt;...&lt;/script&gt;</strong>.
    // Final output never contains a real <script> tag.
    const out = descriptionHtml(
      baseJob('**<script>alert(1)</script>**')
    )
    expect(out).not.toContain('<script>')
    expect(out).toContain('<strong>&lt;script&gt;')
  })

  it('converts single newlines (within a paragraph) to <br/>', () => {
    const out = descriptionHtml(baseJob('Line one\nLine two'))
    expect(out).toContain('Line one<br/>Line two')
  })
})
