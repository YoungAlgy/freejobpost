// US-location parser for ATS imports.
//
// Different providers format locations differently:
//   Greenhouse:  "New York, New York, United States" | "Tempe, Arizona, United States" | "Remote"
//   Lever:       "United States" | "New York, NY" | "San Francisco" | "India" | "Tokyo"
//
// We need to:
//   1. Detect "Remote" / "Anywhere" → city=null, state=null, remote=true
//   2. Match the trailing state name OR 2-letter abbreviation
//   3. Reject non-US locations (we serve US healthcare market)
//
// Note: this is best-effort. When we can't confidently parse, we return
// us:false rather than guess. Better to drop a job than mis-state its location.

import { STATE_HUBS } from '@/lib/state-slugs'

// US states + DC + common territories we'll accept
const US_STATE_NAMES_TO_ABBR: Record<string, string> = Object.fromEntries(
  STATE_HUBS.map((s) => [s.name.toLowerCase(), s.abbr])
)
// Manual extras for territories the STATE_HUBS list doesn't cover
const EXTRA_STATES: Record<string, string> = {
  'district of columbia': 'DC',
  'washington dc': 'DC',
  'washington d.c.': 'DC',
  'puerto rico': 'PR',
}
const ALL_NAMES_TO_ABBR: Record<string, string> = {
  ...US_STATE_NAMES_TO_ABBR,
  ...EXTRA_STATES,
}
const ABBR_SET = new Set([
  ...STATE_HUBS.map((s) => s.abbr),
  'DC',
  'PR',
])

const REMOTE_TOKENS = [
  /^remote$/i,
  /^remote\s*[-,–]/i,
  /remote\s*[-,–]\s*us(a)?$/i,
  /^anywhere$/i,
  /^worldwide$/i,
]

const NON_US_HINTS = [
  /\b(india|tokyo|japan|johannesburg|south africa|london|uk|united kingdom|canada|toronto|berlin|germany|brazil|mexico|spain|france|ireland|dublin|singapore|amsterdam|sydney|australia|emea|apac|latam|philippines)\b/i,
]

export interface ParsedLocation {
  us: boolean
  city: string | null
  state: string | null
  remote: boolean
}

export function parseUsLocation(raw: string | null | undefined): ParsedLocation {
  let s = (raw ?? '').trim()
  if (!s) return { us: false, city: null, state: null, remote: false }

  // 1. A trailing "(Remote)" is a remote FLAG on an otherwise-real location, not
  //    a standalone remote token — strip it FIRST (remember it) so
  //    "Austin, TX (Remote)" keeps its city/state instead of collapsing to a
  //    generic remote result. If nothing real is left ("(Remote)",
  //    "United States (Remote)", "US (Remote)"), it's generic US-remote.
  let remote = false
  if (/\s*\(remote\)\s*$/i.test(s)) {
    remote = true
    s = s.replace(/\s*\(remote\)\s*$/i, '').trim()
    if (!s || /^(united states|usa|u\.?s\.?a?\.?)$/i.test(s)) {
      return { us: true, city: null, state: null, remote: true }
    }
  }

  // 2. Pure "Remote" / "Anywhere" — treat as US-remote by convention (most ATS
  //    boards mean US-remote; international-remote roles usually say so).
  for (const re of REMOTE_TOKENS) {
    if (re.test(s)) return { us: true, city: null, state: null, remote: true }
  }

  // 3. Explicit non-US hint anywhere in the string → reject
  for (const re of NON_US_HINTS) {
    if (re.test(s)) return { us: false, city: null, state: null, remote: false }
  }

  // 4. "United States" or "USA" at the end → trim it and parse what's left
  const trimmed = s
    .replace(/,\s*(united states|usa|us)\.?\s*$/i, '')
    .trim()

  // 5. Comma-split: last segment is state-ish
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return { us: false, city: null, state: null, remote: false }

  const last = parts[parts.length - 1]
  const cityRaw = parts.length >= 2 ? parts[parts.length - 2] : null

  // Match by 2-letter abbreviation (case-insensitive, exact)
  if (last.length === 2 && ABBR_SET.has(last.toUpperCase())) {
    return { us: true, city: cityRaw, state: last.toUpperCase(), remote }
  }
  // Match by state name
  const fromName = ALL_NAMES_TO_ABBR[last.toLowerCase()]
  if (fromName) {
    return { us: true, city: cityRaw, state: fromName, remote }
  }

  // 6. Single-token like just "Texas" or "California"
  if (parts.length === 1 && ALL_NAMES_TO_ABBR[parts[0].toLowerCase()]) {
    return { us: true, city: null, state: ALL_NAMES_TO_ABBR[parts[0].toLowerCase()], remote }
  }

  // Fallback: not confidently parseable. Drop.
  return { us: false, city: null, state: null, remote: false }
}
