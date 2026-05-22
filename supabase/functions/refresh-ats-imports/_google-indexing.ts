// NOTE on Deno globals: the `Deno` global is provided by the Supabase
// Edge runtime — type definitions come from the jsr d.ts import in
// index.ts; this sibling file only needs them at runtime, not at
// editor-time. The Node-side tsc that runs in CI skips this file
// because it's under supabase/functions/ (excluded by tsconfig).

// Google Indexing API client — Deno-flavored sibling of
// src/lib/google-indexing-api.ts (Node).
//
// Both clients do the same thing (sign JWT, exchange for OAuth2 token,
// POST URL notifications to indexing.googleapis.com). The split exists
// because the Node version uses `node:crypto` (RSA-SHA256 via createSign)
// while Deno's edge runtime exposes the Web Crypto API
// (`crypto.subtle.importKey` + `crypto.subtle.sign`). Functionally
// identical; keep both in sync when modifying.
//
// Why we need this in the ATS edge function: the existing wiring on the
// Next.js side only pings Google when a recruiter verifies a /post-job
// submission. That covers ~0-5 jobs/week. The ATS importer creates
// ~30 new jobs every cron tick × ~6 cycles/day ≈ ~180 new
// JobPosting URLs/day — the volume that actually matters for Google for
// Jobs eligibility. Without this, those 180/day land in the sitemap and
// wait 2-24h for Google's normal crawl. With this, they're queued for
// Googlebot within ~15 min.
//
// Activation gate: when GOOGLE_SERVICE_ACCOUNT_JSON env var is unset
// (or empty / malformed JSON), every public function is a fast no-op
// returning false. That lets the edge function ship before GCP setup is
// complete; the moment the secret lands in Supabase Functions Secrets,
// every subsequent cron tick starts pinging Google.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INDEXING_URL =
  'https://indexing.googleapis.com/v3/urlNotifications:publish'
const SCOPE = 'https://www.googleapis.com/auth/indexing'
const TOKEN_TTL_MS = 50 * 60 * 1000 // Google tokens live 1h; refresh at 50min

interface ServiceAccount {
  client_email: string
  private_key: string
}

// In-process token cache — survives across cron-tick invocations of the
// same Deno isolate (Supabase Edge Functions reuse isolates when warm).
let cachedToken: { token: string; expiresAt: number } | null = null

function parseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.client_email || !parsed.private_key) return null
    // Supabase Functions Secrets preserves newlines in JSON values but
    // some setups arrive with literal "\n" — handle both.
    const private_key = parsed.private_key.replace(/\\n/g, '\n')
    return { client_email: parsed.client_email, private_key }
  } catch {
    return null
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  // Encode the raw bytes as base64 then convert to base64url
  // (- + _ instead of + /, no = padding).
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlEncodeString(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text))
}

/**
 * Parse a PEM-encoded PKCS8 RSA private key (the format inside the
 * `private_key` field of a Google service-account JSON) into a Web Crypto
 * CryptoKey suitable for RSASSA-PKCS1-v1_5 with SHA-256.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip the PEM header/footer + whitespace, base64-decode to raw DER.
  const cleaned = pem
    .replace(/-----BEGIN[^-]+-----/, '')
    .replace(/-----END[^-]+-----/, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signJwt(account: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: nowSec + 3600,
    iat: nowSec,
  }
  const headerSeg = base64UrlEncodeString(JSON.stringify(header))
  const claimSeg = base64UrlEncodeString(JSON.stringify(claims))
  const signingInput = `${headerSeg}.${claimSeg}`
  const key = await importPrivateKey(account.private_key)
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`
}

async function getAccessToken(): Promise<string | null> {
  const account = parseServiceAccount()
  if (!account) return null

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  let assertion: string
  try {
    assertion = await signJwt(account)
  } catch (e) {
    console.warn(
      `[google-indexing] JWT sign error: ${e instanceof Error ? e.message : 'unknown'}`,
    )
    return null
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[google-indexing] token ${res.status} ${text.slice(0, 200)}`)
      return null
    }
    const json = await res.json() as { access_token?: string }
    if (!json.access_token) return null
    cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    }
    return json.access_token
  } catch (e) {
    console.warn(
      `[google-indexing] token fetch error: ${e instanceof Error ? e.message : 'unknown'}`,
    )
    return null
  }
}

export type NotificationType = 'URL_UPDATED' | 'URL_DELETED'

/**
 * Push one URL-change notification. Returns true on 2xx, false otherwise
 * (no service-account configured, network error, non-2xx, etc.). Never
 * throws — callers can fire-and-forget without unhandled rejections.
 */
export async function notifyGoogleIndexingApi(
  url: string,
  type: NotificationType = 'URL_UPDATED',
): Promise<boolean> {
  const token = await getAccessToken()
  if (!token) return false

  try {
    const res = await fetch(INDEXING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url, type }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(
        `[google-indexing] publish ${res.status} ${text.slice(0, 200)}`,
      )
      // 401 → token went bad. Drop cache so next call refreshes.
      if (res.status === 401) cachedToken = null
      return false
    }
    return true
  } catch (e) {
    console.warn(
      `[google-indexing] publish fetch error: ${e instanceof Error ? e.message : 'unknown'}`,
    )
    return false
  }
}

/**
 * Notify a batch of URLs with bounded parallelism. The Indexing API doesn't
 * have a true batch endpoint — this just parallelizes individual POSTs.
 * Returns { ok, failed } counts.
 *
 * Default concurrency 5 keeps us well under any per-IP rate-limit Google
 * applies. Default quota is 200/day per project; this caller should batch
 * accordingly (e.g. cap at 150 per cron tick if ATS imports surge).
 */
export async function notifyGoogleIndexingApiBatch(
  urls: string[],
  options: { concurrency?: number; type?: NotificationType } = {},
): Promise<{ ok: number; failed: number }> {
  const { concurrency = 5, type = 'URL_UPDATED' } = options
  if (urls.length === 0) return { ok: 0, failed: 0 }

  // Short-circuit if env unset — avoid spending 30s scheduling no-op
  // promises only to find out we can't actually call the API.
  if (!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) {
    return { ok: 0, failed: 0 }
  }

  let ok = 0
  let failed = 0
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map((url) => notifyGoogleIndexingApi(url, type)),
    )
    for (const r of results) {
      if (r) ok += 1
      else failed += 1
    }
  }
  return { ok, failed }
}
