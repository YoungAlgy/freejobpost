import { describe, expect, it } from 'vitest'
import { safeJsonLd } from './safe-jsonld'

// These tests pin the XSS guards. If anyone ever switches safeJsonLd back
// to raw JSON.stringify, all four of these fail loudly.

describe('safeJsonLd', () => {
  it('escapes < to prevent </script> early-close', () => {
    const out = safeJsonLd({ title: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(out).toContain('\\u003c')
  })

  it('escapes > for symmetry with <', () => {
    const out = safeJsonLd({ x: 'a > b' })
    expect(out).not.toContain('>')
    expect(out).toContain('\\u003e')
  })

  it('escapes & to prevent HTML-entity confusion', () => {
    const out = safeJsonLd({ x: 'foo & bar' })
    expect(out).not.toContain('&')
    expect(out).toContain('\\u0026')
  })

  it('escapes U+2028 line separator (breaks pre-2019 JS string parsers)', () => {
    const ls = String.fromCodePoint(0x2028)
    const out = safeJsonLd({ x: `before${ls}after` })
    expect(out).not.toContain(ls)
    expect(out).toContain('\\u2028')
  })

  it('escapes U+2029 paragraph separator', () => {
    const ps = String.fromCodePoint(0x2029)
    const out = safeJsonLd({ x: `before${ps}after` })
    expect(out).not.toContain(ps)
    expect(out).toContain('\\u2029')
  })

  it('round-trips: JSON.parse(safeJsonLd(x)) === x for benign data', () => {
    const original = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Family Medicine Physician',
      description: 'Outpatient role with shared call.',
      tags: ['MD', 'DO'],
    }
    const serialized = safeJsonLd(original)
    expect(JSON.parse(serialized)).toEqual(original)
  })

  it('round-trips: parsed output reconstructs the original even when the source contains XSS payload', () => {
    // The payload was XSS in the HTML context, but it's just plain text in
    // the JSON context. JSON.parse should give us back the exact same string.
    const evil = {
      title: '</script><script>alert(1)</script>',
      desc: 'a < b > c & d',
    }
    expect(JSON.parse(safeJsonLd(evil))).toEqual(evil)
  })

  it('handles arrays and nested objects', () => {
    const data = { items: [{ name: '</a>' }, { name: '&amp' }] }
    expect(safeJsonLd(data)).not.toContain('</')
    expect(JSON.parse(safeJsonLd(data))).toEqual(data)
  })
})
