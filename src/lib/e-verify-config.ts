// E-Verify enrollment config.
//
// MIRRORED ACROSS REPOS. Both freejobpost/src/lib/e-verify-config.ts and
// freeresumepost/src/lib/e-verify-config.ts and avahealth-providers/src/lib/
// e-verify-config.ts must stay byte-identical. When enrollment status
// changes, update all three in the same commit.
//
// Florida SB 1718 (effective July 1, 2023; enforcement July 1, 2024) requires
// all FL private employers with 25+ employees to enroll in the federal
// E-Verify system and verify work-eligibility of every new hire within 3
// business days. Enrollment is free at e-verify.gov.
//
// Once Ava Health Partners LLC enrolls, flip `enrolled = true` and paste
// the E-Verify Company ID (issued at enrollment, format: 7-digit number).
// The Footer reads this and conditionally renders the official "E-Verify
// participant" badge + Right-to-Work poster link. Until enrolled = true,
// nothing renders (no false claim of participation).

export const E_VERIFY = {
  /**
   * Set to true ONLY after enrollment is complete and the Company ID is
   * issued by USCIS. Misrepresenting E-Verify participation is a federal
   * compliance violation, so default-false until you have the actual ID.
   */
  enrolled: true,

  /**
   * E-Verify-issued Company ID (7 digits). Required by USCIS branding
   * guidance to display alongside the participation logo.
   */
  companyId: '3024987',

  /**
   * MOU effective date — also required on the badge per USCIS branding
   * guidelines. ISO 8601 (YYYY-MM-DD).
   */
  mouDate: '2026-05-26',
} as const
