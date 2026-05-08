// Safe JSON-LD serializer for use inside `<script type="application/ld+json">`
// blocks rendered via `dangerouslySetInnerHTML`.
//
// Why this matters: plain JSON.stringify does NOT escape `<`, `>`, `&`, or
// the U+2028/U+2029 line separators. Inside a `<script>` block, an unescaped
// `</script>` sequence breaks out of the tag, and a recruiter who controls
// any field that ends up in the JSON-LD can inject arbitrary HTML/script.
// Specifically:
//
//   {"name": "</script><script>alert(1)</script>"}
//
// — when injected into a script block via dangerouslySetInnerHTML, the
// browser's HTML parser sees `</script>` BEFORE it processes the JSON, ends
// the JSON-LD block, and starts executing the injected script. This is a
// real XSS vector wherever user-submitted text (job.title, job.description,
// candidate names, employer names, etc.) flows into the JSON graph.
//
// THIS FILE IS MIRRORED ACROSS REPOS. Both freejobpost/src/lib/safe-jsonld.ts
// and freeresumepost/src/lib/safe-jsonld.ts must stay byte-identical.
//
// References:
//   - OWASP DOM XSS Prevention Cheat Sheet (rule §3 — escaping JSON in script)
//   - https://github.com/zertosh/htmlescape (the original go-to lib for this)

/**
 * Stringifies a JSON-LD payload safely for injection into a
 * `<script type="application/ld+json">` block. Use everywhere JSON-LD
 * renders via `dangerouslySetInnerHTML`.
 *
 * Replacements (input char on the left → JSON-escaped form on the right):
 *   - `<`    → <   prevents </script> early-close + comment break
 *   - `>`    → >   symmetric with above
 *   - `&`    → &   prevents HTML-entity confusion in some parser modes
 *   - U+2028 → \u2028   JSON allows it; pre-2019 JS string literals don't
 *   - U+2029 → \u2029   same
 *
 * The escaped output is still valid JSON — JSON.parse() reads it back to
 * the original object. Search engines that read JSON-LD parse it as JSON
 * (not HTML), so they see the unescaped values too.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
