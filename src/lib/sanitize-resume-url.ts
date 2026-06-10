// Validates the optional resume_url an applicant submits with an application.
// The employer notification email renders it as a clickable link, so this is
// a phishing/XSS surface: accept only http(s) URLs of sane length, reject
// userinfo URLs (https://docs.google.com@evil.tld/cv.pdf — the lookalike-host
// phishing shape). Invalid input degrades to null (the field is optional)
// rather than failing the application. 2026-06 audit rounds 2 + 3.
//
// Lives in lib (not the 'use server' action file) because server-action
// modules may only export async functions, and this needs unit tests.
export function sanitizeResumeUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v.length > 500) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}
