import { describe, it, expect } from 'vitest'
import { buildSpecialtyOrFilter } from './specialty-filter'

describe('buildSpecialtyOrFilter', () => {
  it('produces 3 ilike clauses per pattern (specialty + title + role)', () => {
    const out = buildSpecialtyOrFilter(['cardio'])
    const clauses = out.split(',')
    expect(clauses).toHaveLength(3)
    expect(clauses[0]).toBe('specialty.ilike.%cardio%')
    expect(clauses[1]).toBe('title.ilike.%cardio%')
    expect(clauses[2]).toBe('role.ilike.%cardio%')
  })

  it('comma-joins N patterns into 3N clauses', () => {
    const out = buildSpecialtyOrFilter(['cardio', 'cardiov', 'electrophys'])
    const clauses = out.split(',')
    expect(clauses).toHaveLength(9)
  })

  // ── REGRESSION GUARDS for the 2026-05-22 critical bug ───────────────
  //
  // The bug: encodeURIComponent('*pattern with space*') turns the space
  // into %20, then supabase-js encodes that % to %25, producing %2520
  // in the final URL. PostgREST decodes once back to %20 and runs
  // ILIKE '%pattern%20with%20space%' which matches nothing real.
  //
  // Six+ specialty hubs (Physician Assistant, Registered Nurse, Family
  // Medicine, Internal Medicine, Hospital Medicine, etc.) had
  // multi-word matchPatterns and silently returned 0 jobs at runtime.
  // Cells without space (cardiology, hospitalist) masked the bug across
  // every audit pass that didn't directly test the space-pattern cases.

  it('REGRESSION: multi-word patterns survive with raw spaces (no URL-encoding)', () => {
    const out = buildSpecialtyOrFilter(['physician assistant'])
    // Raw space must appear in the output — supabase-js will URL-encode
    // exactly once when building the request. Pre-encoding here would
    // cause the historical double-encoding bug.
    expect(out).toContain('%physician assistant%')
    expect(out).not.toContain('%2520')
    expect(out).not.toContain('%20')
  })

  it('REGRESSION: output contains no URL-encoded percent (%25) characters', () => {
    const out = buildSpecialtyOrFilter([
      'registered nurse',
      'rn ',
      ' rn',
      'icu nurse',
      'critical care nurse',
    ])
    // No %25 anywhere = the wildcard % wasn't accidentally pre-encoded.
    expect(out).not.toContain('%25')
  })

  it('REGRESSION: output contains no "*" wildcards (raw % is the syntax we use)', () => {
    // The old code used `*pattern*` which is PostgREST's URL-syntax
    // wildcard. That works on simple patterns but the pre-encoding step
    // mangled multi-word ones. We standardized on `%` (the SQL LIKE
    // wildcard) which supabase-js encodes correctly.
    const out = buildSpecialtyOrFilter(['cardio', 'family medicine'])
    expect(out).not.toContain('*')
  })

  it('REGRESSION: empty matchPatterns produces empty string (no orphan commas)', () => {
    // Defensive: an empty matchPatterns array should produce '' (which
    // supabase-js will treat as no .or() filter applied). Not '%%' or
    // ',' which would match-all or break the .or() syntax.
    expect(buildSpecialtyOrFilter([])).toBe('')
  })

  it('REGRESSION: leading/trailing space in pattern is preserved', () => {
    // ' rn' (leading space) is a real matchPattern on the RN hub —
    // catches "Lead RN" / "Charge RN" / etc. where 'rn' alone would
    // false-positive on countless other titles. The space must be
    // preserved through the filter build.
    const out = buildSpecialtyOrFilter([' rn'])
    expect(out).toBe('specialty.ilike.% rn%,title.ilike.% rn%,role.ilike.% rn%')
  })

  it('REGRESSION: hyphenated patterns survive intact (pa-c, ccc-slp, etc.)', () => {
    const out = buildSpecialtyOrFilter(['pa-c', 'ccc-slp'])
    expect(out).toContain('%pa-c%')
    expect(out).toContain('%ccc-slp%')
    // Hyphen is not a URL special char, but verifying it survives is
    // cheap and catches future overzealous sanitization.
    expect(out).not.toContain('pa%2Dc')
  })

  it('REGRESSION: ampersand in pattern is NOT pre-encoded (would interfere with PostgREST .or() comma-join)', () => {
    // Hypothetical: if someone added 'r&d' or 'maternal & child health'
    // as a pattern, the & should pass through. supabase-js handles
    // URL-encoding the final request body; pre-encoding here would
    // produce %26 which PostgREST would interpret as the literal
    // string '%26'.
    const out = buildSpecialtyOrFilter(['maternal & child health'])
    expect(out).toContain('%maternal & child health%')
    expect(out).not.toContain('%26')
  })
})
