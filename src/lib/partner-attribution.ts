// Canonical allowlist + normalizer for the `?ref=<partner>` query param
// used across /jobs.xml, /jobs/[slug], and /click/[slug] for per-partner
// attribution in the apply_clicks table.
//
// Why an allowlist (and not just a regex):
//   - Keeps apply_clicks.partner from filling up with arbitrary strings
//     a partner / spammer could append to URLs (e.g. ?ref=tracking-pixel-1,
//     ?ref=evilpartner123). The dashboard at /admin/attribution would
//     otherwise grow a long tail of garbage rows.
//   - Means the partner table is deterministic — we can count rows
//     against a known list and notice when a real partner is missing.
//
// What's in here vs. SYNDICATION_TARGETS:
//   - SYNDICATION_TARGETS lives in syndication-targets.ts and describes
//     WHERE WE PUSH JOBS TO (publisher feeds we generate + maintain).
//   - This allowlist describes WHERE TRAFFIC ATTRIBUTION CAN COME FROM
//     (publishers + scrapers + UTM-style attribution sources).
//   - Allowlist is broader: includes 'monster' / 'simplyhired' (no
//     official feed deal, but they may scrape our feed and link us),
//     'internal' (default for traffic without ?ref), 'google' (Google
//     for Jobs surface), 'rss' (long-tail readers).
//
// Keep in sync with the partner column shape in apply_clicks.partner
// (text, no FK — log_apply_click() length-caps + lowercases).

const PARTNER_ALLOWLIST: ReadonlySet<string> = new Set([
  'internal',
  'talent',
  'adzuna',
  'jooble',
  'careerjet',
  'glassdoor',
  'ziprecruiter',
  'linkedin',
  'indeed',
  'monster',
  'simplyhired',
  'rss',
  'google',
])

/**
 * Normalize a raw `?ref=<value>` query-param into a known partner key.
 * Anything outside the allowlist collapses to 'internal' so a malicious
 * or careless caller can't pollute the apply_clicks rollup.
 *
 * - Lowercases + trims + length-caps to 64 chars (apply_clicks.partner
 *   has a length-cap in the RPC, but defense in depth here keeps URLs
 *   from carrying pathological values).
 * - Returns 'internal' for null / undefined / unknown.
 */
export function normalizePartner(raw: string | null | undefined): string {
  if (!raw) return 'internal'
  const lower = raw.toLowerCase().trim().slice(0, 64)
  return PARTNER_ALLOWLIST.has(lower) ? lower : 'internal'
}

export function isAllowedPartner(value: string): boolean {
  return PARTNER_ALLOWLIST.has(value)
}

// Export for tests + diagnostics that need to enumerate known partners.
export const ALL_PARTNERS: readonly string[] = Array.from(PARTNER_ALLOWLIST)
