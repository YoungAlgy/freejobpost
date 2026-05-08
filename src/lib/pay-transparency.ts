// Pay-transparency rules per US state.
//
// A growing number of US states require employers to publish salary ranges
// on job postings. Civil penalties are real (CA: $100–$10K per violation;
// WA: $100–$5K). When a recruiter posts a job in one of these states without
// a salary range, they're potentially violating the law and exposing
// themselves to a complaint by any candidate who applies.
//
// Posture: rather than letting recruiters submit non-compliant postings
// (which we'd then re-syndicate to Indeed / ZipRecruiter / Adzuna and
// amplify the violation), we block submission with a friendly inline
// explanation. This is also a positive differentiation signal — the candidate
// experience is meaningfully better when every CA / NY / WA / CO listing
// shows a number.
//
// References (verified 2026-04-30):
//   CA SB 1162  — effective 2023-01-01 (≥15-employee employers)
//   CO Equal Pay for Equal Work Act — effective 2021-01-01 (all employers)
//   NY S9427-A — effective 2023-09-17 (≥4-employee employers)
//   WA SB 5761 — effective 2023-01-01 (≥15-employee employers)
//   HI HB 2657 — effective 2024-01-01 (≥50-employee employers)
//   IL HB 3129 — effective 2025-01-01 (≥15-employee employers)
//   MD HB 649  — effective 2024-10-01 (all employers)
//   MN H 4444  — effective 2025-01-01 (≥30-employee employers)
//   VT H 704   — effective 2025-07-01 (≥5-employee employers)
//   DC SB B25-194 — effective 2024-06-30 (all employers)
//
// Pragmatic choice: enforce range requirement for ALL postings in these
// states regardless of employer size. We can't reliably know the employer's
// headcount at submission time, and over-enforcement is far cheaper than
// under-enforcement (which is a legal exposure).

export type PayTransparencyState = 'CA' | 'CO' | 'NY' | 'WA' | 'HI' | 'IL' | 'MD' | 'MN' | 'VT' | 'DC'

const PAY_TRANSPARENCY_STATES: ReadonlySet<PayTransparencyState> = new Set([
  'CA',
  'CO',
  'NY',
  'WA',
  'HI',
  'IL',
  'MD',
  'MN',
  'VT',
  'DC',
])

/** Citation shown in the inline disclosure when a recruiter is posting in one of these states. */
const STATE_CITATION: Record<PayTransparencyState, string> = {
  CA: 'CA SB 1162',
  CO: 'CO Equal Pay Act',
  NY: 'NY S9427-A',
  WA: 'WA SB 5761',
  HI: 'HI HB 2657',
  IL: 'IL HB 3129',
  MD: 'MD HB 649',
  MN: 'MN H 4444',
  VT: 'VT H 704',
  DC: 'DC B25-194',
}

/**
 * Returns true if a posting in this state legally requires a published salary
 * range. State should be a 2-letter US abbreviation (e.g. "CA").
 *
 * For remote-flagged postings, this returns false — the law of the candidate's
 * state, not the employer's, controls. We don't know the candidate's state at
 * post-time, so we let remote postings through. (Most remote employers
 * voluntarily publish ranges anyway, both for compliance and for candidate
 * experience.)
 */
export function requiresSalaryDisclosure(state: string | null | undefined): boolean {
  if (!state || state.length !== 2) return false
  return PAY_TRANSPARENCY_STATES.has(state.toUpperCase() as PayTransparencyState)
}

/**
 * Returns the law citation shown in the inline form disclosure. Returns null
 * when the state doesn't have a pay-transparency law on the books.
 */
export function payTransparencyCitation(state: string | null | undefined): string | null {
  if (!state || state.length !== 2) return null
  const abbr = state.toUpperCase() as PayTransparencyState
  return PAY_TRANSPARENCY_STATES.has(abbr) ? STATE_CITATION[abbr] : null
}

/**
 * Validates a {state, salary_min, salary_max} triple against pay-transparency
 * rules. Returns null if compliant, or a user-friendly error string when the
 * posting is missing a required salary range. Used both client-side (advance
 * gating on /post-job step 2) and server-side (defense in depth in actions.ts).
 *
 * Rules:
 *   1. State must require disclosure (otherwise no opinion)
 *   2. Both min and max must be set (NY requires *range*, not just one number)
 *   3. min ≤ max
 *   4. min must be > 0 (zero would be a sham range)
 */
export function validatePayTransparency(
  state: string | null | undefined,
  salaryMin: number | null | undefined,
  salaryMax: number | null | undefined
): string | null {
  if (!requiresSalaryDisclosure(state)) return null
  const citation = payTransparencyCitation(state)
  const stateUpper = state!.toUpperCase()
  if (salaryMin == null || salaryMax == null) {
    return `${stateUpper} requires a posted salary range (${citation}). Add both a minimum and a maximum salary to continue.`
  }
  if (salaryMin <= 0 || salaryMax <= 0) {
    return `${stateUpper} requires a real salary range (${citation}). Zero is not a valid minimum or maximum.`
  }
  if (salaryMin > salaryMax) {
    return `Salary minimum can't be higher than the maximum.`
  }
  return null
}
