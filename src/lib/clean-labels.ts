// Defense-in-depth label cleanup for candidate-facing surfaces.
//
// Background: some seeded job rows have salary ranges, sign-on bonuses, and
// hiring-incentive amounts bled into the `title`, `specialty`, and `role`
// text fields. Per `memory/feedback_candidate_pitch_rules.md`:
//   "No sign-on bonus disclosure in candidate-facing copy. Anonymize client
//    names."
//
// The root fix is to clean those DB rows (separate task). This helper is the
// display-time guard so the public surface doesn't leak bonus amounts while
// the cleanup is pending.
//
// Examples it strips:
//   "Interventional Pain Physician – $550K"      → "Interventional Pain Physician"
//   "Mohs Surgeon - $700K plus productivity..."   → "Mohs Surgeon"
//   "RN ICU - $18,900 Hiring Incentives"          → "RN ICU"
//   "Cardiac Nurse - (RN - Step Down) - $12,400 Sign On Bonus"
//                                                  → "Cardiac Nurse - (RN - Step Down)"
//   "Nurse Practitioner - $115K-$130K Negotiable!" → "Nurse Practitioner"
//   "Dermatologist - Up to $700K (First Year ...)" → "Dermatologist"
//
// Conservative: only strips when the trailing segment is unambiguously
// salary/bonus-flavored (contains `$` or a known cue word). Plain hyphenated
// names like "Family Medicine - Outpatient" are preserved.

const SALARY_SUFFIX_RE =
  /\s*[–\-]\s*(?:\$|Up\s+to\s+\$|Sign[\s-]?On\s+Bonus|Hiring\s+Incentives?).*$/i

/** Strip a trailing salary or sign-on-bonus disclosure from a public label. */
export function stripSalarySuffix(label: string | null | undefined): string {
  if (!label) return ''
  return label.replace(SALARY_SUFFIX_RE, '').trim()
}
