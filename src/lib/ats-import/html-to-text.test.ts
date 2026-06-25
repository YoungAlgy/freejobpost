import { describe, expect, it } from 'vitest'
import { htmlToText } from './html-to-text'

describe('htmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('passes plain text through unchanged', () => {
    expect(htmlToText('Family Medicine Physician')).toBe('Family Medicine Physician')
  })

  describe('entity decoding', () => {
    it('decodes the common named + numeric entities', () => {
      expect(htmlToText('R&amp;D')).toBe('R&D')
      expect(htmlToText('a&nbsp;b')).toBe('a b')
      // &lt;/&gt; decode to < and >. (A decoded full "<tag>" is then removed by
      // the tag stripper, by design, so test < in a non-tag context.)
      expect(htmlToText('shifts &lt; 12 hours')).toBe('shifts < 12 hours')
      expect(htmlToText('It&#39;s here')).toBe("It's here")
      expect(htmlToText('say &quot;hi&quot;')).toBe('say "hi"')
    })
    it('decodes double-encoded entities like &amp;nbsp;', () => {
      expect(htmlToText('A&amp;nbsp;B')).toBe('A B')
    })
  })

  describe('block tags become newlines', () => {
    it('turns paragraphs into blank-line-separated blocks', () => {
      expect(htmlToText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo')
    })
    it('turns <br> into a single newline', () => {
      expect(htmlToText('Line1<br>Line2')).toBe('Line1\nLine2')
      expect(htmlToText('Line1<br/>Line2')).toBe('Line1\nLine2')
    })
    it('turns </div> and </h2> into newlines', () => {
      expect(htmlToText('<div>A</div><div>B</div>')).toBe('A\nB')
      expect(htmlToText('<h2>Title</h2>Body')).toBe('Title\n\nBody')
    })
  })

  describe('lists', () => {
    it('prefixes list items with a bullet', () => {
      expect(htmlToText('<ul><li>A</li><li>B</li></ul>')).toBe('• A\n• B')
    })
    it('handles <li> with attributes', () => {
      expect(htmlToText('<ul><li class="x">A</li></ul>')).toBe('• A')
    })
  })

  describe('cleanup', () => {
    it('strips remaining inline tags but keeps their text', () => {
      expect(htmlToText('<b>Bold</b> and <a href="x">link</a>')).toBe('Bold and link')
    })
    it('collapses runs of spaces and excess blank lines', () => {
      expect(htmlToText('a      b')).toBe('a b')
      expect(htmlToText('<p>A</p>\n\n\n<p>B</p>')).toBe('A\n\nB')
    })
  })
})
