// Shared helper for building the PostgREST `.or()` filter clause that
// matches a specialty hub's matchPatterns against the public_jobs
// specialty / role / title columns.
//
// Extracted into its own module + unit-tested after the 2026-05-22
// audit found a silent zero-jobs bug: the inline duplicates in
// /specialty/[slug]/page.tsx and /specialty/[slug]/[state]/page.tsx
// both wrapped the value with encodeURIComponent('*pattern*'). That
// double-encoded spaces (%20 → %2520 → PostgREST decodes once back to
// literal %20 in the SQL ILIKE pattern, matches nothing). Specialties
// with no spaces in matchPatterns (cardiology, hospitalist, etc.)
// silently masked the bug across every audit pass that didn't directly
// test PA/RN/family-med/etc.
//
// Centralizing here prevents the same bug from sneaking back into
// either consumer. The test asserts that the output contains raw %
// wildcards, no URL-encoded percent-25 anywhere, and the right number
// of clauses for the column set.

/**
 * Build a PostgREST .or() filter clause from a specialty hub's
 * matchPatterns. Generates `specialty.ilike.%p%,title.ilike.%p%,role.ilike.%p%`
 * for each pattern, comma-joined.
 *
 * CRITICAL: the wildcard is raw `%` — supabase-js URL-encodes the .or()
 * string exactly once when assembling the request. Pre-encoding with
 * encodeURIComponent is the bug we're guarding against; tests below
 * fail loudly if anyone re-introduces it.
 */
export function buildSpecialtyOrFilter(matchPatterns: readonly string[]): string {
  const orParts: string[] = []
  for (const p of matchPatterns) {
    const pat = `%${p}%`
    orParts.push(`specialty.ilike.${pat}`, `title.ilike.${pat}`, `role.ilike.${pat}`)
  }
  return orParts.join(',')
}
