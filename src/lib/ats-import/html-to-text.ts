// Minimal HTML→plaintext converter for Greenhouse job descriptions.
//
// We don't pull in jsdom or cheerio — the descriptions are simple boilerplate
// HTML (p, ul, li, br, b, strong, em, a). A regex pass gives us clean enough
// text for storage. The page renders job descriptions with `whitespace-pre-line`
// so newlines and bullets survive.

export function htmlToText(html: string): string {
  if (!html) return ''

  // Run TWO decode passes so double-encoded entities like &amp;nbsp; resolve
  // correctly (Greenhouse content blobs occasionally have these). Decode &amp;
  // FIRST in each pass so it doesn't strand the inner entity behind a &amp;
  // prefix.
  const decodeOnce = (str: string): string =>
    str
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&rsquo;/g, '’')
      .replace(/&lsquo;/g, '‘')
      .replace(/&rdquo;/g, '”')
      .replace(/&ldquo;/g, '“')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')

  let s = decodeOnce(decodeOnce(html))

  // Block tags → newline; list items → "• " prefix
  s = s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<\s*\/\s*div\s*>/gi, '\n')
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, '\n\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\s*\/\s*li\s*>/gi, '\n')
    .replace(/<\s*\/\s*ul\s*>/gi, '\n')
    .replace(/<\s*\/\s*ol\s*>/gi, '\n')

  // Strip all remaining tags
  s = s.replace(/<[^>]+>/g, '')

  // Collapse whitespace: multiple blank lines → 2, trim trailing spaces per line
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return s
}
