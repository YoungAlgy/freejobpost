// Ava Health narrowed to nurse + allied health only, 2026-08-20 (physician
// and PA roles moved to MASC Medical — see specialty-slugs.ts, which no
// longer has hubs for either). This gate keeps that scoping consistent at
// intake, not just on the browse pages: without it, an employer could still
// post a physician/PA role here and it would surface on the general
// /state/[slug] and /city/[slug] pages (location-filtered only, not
// specialty-filtered) even with no specialty hub left to browse it from.
//
// Deliberately conservative — checks only the short structured fields
// (title, role, specialty), not the free-text description, and only matches
// unambiguous physician/PA credential markers. A false positive (wrongly
// rejecting a real nurse/allied posting) is worse than a false negative (a
// physician posting slipping through occasionally), so patterns that could
// plausibly appear in a legitimate NP/RN/allied posting — "hospitalist",
// physician-adjacent words like "medicine" or "surgical" — are deliberately
// NOT included here.
// Tune this list if it's too aggressive or too lax in practice.

const PHYSICIAN_OR_PA_PATTERNS: RegExp[] = [
  /\bphysicians?\b/i,
  /\bsurgeons?\b/i,
  /\bphysician\s+assistants?\b/i,
  /\bpa-c\b/i,
  /\bcardiologists?\b/i,
  /\boncologists?\b/i,
  /\bneurologists?\b/i,
  /\bradiologists?\b/i,
  /\banesthesiologists?\b/i,
  /\bpsychiatrists?\b/i,
  /\bdermatologists?\b/i,
  /\bgastroenterologists?\b/i,
  /\bobstetricians?\b/i,
  /\bgynecologists?\b/i,
  /\bpediatricians?\b/i,
]

// Bare "MD"/"DO" credential markers (e.g. a role typed as "Family Medicine
// MD") are real signals, but checking them against the title field produces
// false positives: the title field's own placeholder ("e.g. ICU Registered
// Nurse, Tampa, FL") encourages employers to suffix a city/state, and
// two-letter "MD" is also the Maryland abbreviation ("Baltimore, MD") and a
// substring of facility names ("MD Anderson Cancer Center"). Title has no
// legitimate reason to carry a person's credential suffix, so these patterns
// are checked against role/specialty only, never title.
const MD_DO_CREDENTIAL_PATTERNS: RegExp[] = [
  /(^|[\s,/(])m\.?d\.?([\s,/)]|$)/i,
  /(^|[\s,/(])d\.?o\.?([\s,/)]|$)/i,
]

/**
 * Returns a user-facing rejection message when title/role/specialty
 * unambiguously identifies a physician or physician-assistant posting, or
 * null when the posting is in scope. Checked against the short structured
 * fields only — see the file header for why the description is excluded.
 */
export function validateSpecialtyScope(
  title: string | null | undefined,
  role: string | null | undefined,
  specialty: string | null | undefined
): string | null {
  const hay = `${title ?? ''} ${role ?? ''} ${specialty ?? ''}`
  const credentialHay = `${role ?? ''} ${specialty ?? ''}`
  const isPhysicianOrPa =
    PHYSICIAN_OR_PA_PATTERNS.some((re) => re.test(hay)) ||
    MD_DO_CREDENTIAL_PATTERNS.some((re) => re.test(credentialHay))
  if (!isPhysicianOrPa) return null
  return 'Ava Health posts nurse and allied-health roles only. Physician and PA roles are outside what we accept here.'
}
