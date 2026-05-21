// Google Indexing API — push URL change notifications to Google so
// Googlebot crawls new JobPosting pages within minutes instead of the
// typical 2–24h sitemap-discovery latency.
//
// Per Google's docs (developers.google.com/search/apis/indexing-api/v3/quickstart):
//   "For job posting URLs, we recommend using the Indexing API instead
//    of sitemaps because the Indexing API prompts Googlebot to crawl
//    your page sooner."
//
// Why we built our own client instead of importing google-auth-library:
//   The full googleapis npm package weighs in around 60–80 MB of
//   transitive deps. For a 30-line OAuth2 JWT-bearer exchange + a
//   single POST, the dep cost isn't worth it. Node's built-in `crypto`
//   has everything we need (RSA-SHA256 signing).
//
// Setup required ONCE in Google Cloud Console + Search Console — see
// docs/GOOGLE_FOR_JOBS.md for the boss-facing version of these steps:
//   1. Create a Google Cloud project + a service account inside it
//   2. Enable the "Web Search Indexing API" on the project
//   3. Generate a JSON key for the service account, download it
//   4. In Search Console: Settings → Users and permissions → add the
//      service account's client_email as a verified Owner of
//      freejobpost.co
//   5. Paste the full JSON-key contents into the Vercel env var
//      GOOGLE_SERVICE_ACCOUNT_JSON (server-side only)
//
// When the env var is NOT set, every call here is a fast no-op. That
// lets the integration ship before the GCP-side setup is complete; once
// the env var lands in prod, every subsequent verify-page hit (and any
// future caller) starts pinging Google. No code change needed to
// activate.
//
// Quota note: Google's default is 200 URL notifications per project per
// day, way more than our /post-job submission rate. ATS-import bursts
// (~30/cycle × 6 cycles/day ≈ 180/day) come close — we'd batch or
// request a quota lift if that hits. Quota lifts are routinely
// granted free for JobPosting use cases.

import { createSign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INDEXING_URL =
  'https://indexing.googleapis.com/v3/urlNotifications:publish'
const SCOPE = 'https://www.googleapis.com/auth/indexing'
// Google tokens live 1h; refresh at 50 min to leave headroom.
const TOKEN_TTL_MS = 50 * 60 * 1000

type ServiceAccount = {
  client_email: string
  private_key: string
}

// Cached access token. Module-scope so successive calls in the same
// Next.js worker reuse it; survives across requests in the same lambda
// instance. A cold start does one extra OAuth2 round-trip — fine since
// the lambda persists between invocations.
let cachedToken: { token: string; expiresAt: number } | null = null

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.client_email || !parsed.private_key) {
      console.warn(
        '[google-indexing] GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key'
      )
      return null
    }
    // Vercel env-var input often arrives with \n escaped as the literal
    // characters `\` + `n`. Reverse that so crypto.createSign() can read
    // the PEM as actual newline-separated lines.
    const private_key = parsed.private_key.replace(/\\n/g, '\n')
    return { client_email: parsed.client_email, private_key }
  } catch (e) {
    console.warn(
      '[google-indexing] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:',
      e instanceof Error ? e.message : 'unknown'
    )
    return null
  }
}

// RFC 7519 base64url — like base64 but with '+' → '-', '/' → '_', no '=' padding.
function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/**
 * Sign a JWT-bearer assertion for the Google OAuth2 token endpoint.
 * Returns the compact-JWS form: <base64url-header>.<base64url-claims>.<base64url-signature>.
 *
 * Exported for testing — production code goes through getAccessToken().
 */
export function signGoogleJwt(account: ServiceAccount, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: nowSec + 3600,
    iat: nowSec,
  }
  const headerSeg = base64Url(Buffer.from(JSON.stringify(header), 'utf8'))
  const claimSeg = base64Url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const signingInput = `${headerSeg}.${claimSeg}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const sig = base64Url(signer.sign(account.private_key))
  return `${signingInput}.${sig}`
}

async function getAccessToken(): Promise<string | null> {
  const account = parseServiceAccount()
  if (!account) return null

  // Hot path: reuse the cached token until 50 min before its 1h expiry.
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  let assertion: string
  try {
    assertion = signGoogleJwt(account)
  } catch (e) {
    console.warn(
      '[google-indexing] JWT sign error:',
      e instanceof Error ? e.message : 'unknown'
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
    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) {
      console.warn('[google-indexing] token response missing access_token')
      return null
    }
    cachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    }
    return json.access_token
  } catch (e) {
    console.warn(
      '[google-indexing] token fetch error:',
      e instanceof Error ? e.message : 'unknown'
    )
    return null
  }
}

export type NotificationType = 'URL_UPDATED' | 'URL_DELETED'

/**
 * Push one URL-change notification to the Google Indexing API. Returns
 * `true` on success, `false` otherwise (e.g. no service account configured,
 * network error, or non-2xx response). Never throws — callers can fire-
 * and-forget without worrying about un-handled rejections.
 *
 * The Indexing API ONLY supports JobPosting + BroadcastEvent URLs.
 * Other URL types succeed with 200 but Google's docs warn the
 * notification will be dropped. Don't call this with hub or detail
 * URLs that aren't /jobs/[slug].
 */
export async function notifyGoogleIndexingApi(
  url: string,
  type: NotificationType = 'URL_UPDATED'
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
        `[google-indexing] publish ${res.status} ${text.slice(0, 200)}`
      )
      // 401 means the token went bad — invalidate the cache so the next
      // call re-fetches. (Rare unless the service account key was
      // rotated; defensive.)
      if (res.status === 401) cachedToken = null
      return false
    }
    return true
  } catch (e) {
    console.warn(
      '[google-indexing] publish fetch error:',
      e instanceof Error ? e.message : 'unknown'
    )
    return false
  }
}

/** Convenience: notify for a single job slug. Mirrors notifyIndexNowForJob(). */
export async function notifyGoogleForJob(slug: string): Promise<boolean> {
  return notifyGoogleIndexingApi(`https://freejobpost.co/jobs/${slug}`, 'URL_UPDATED')
}

/**
 * Test-only escape hatch. Resets the in-process token cache so tests
 * can verify the JWT-sign + token-fetch flow without contaminating
 * other test cases.
 */
export function _resetGoogleIndexingCache(): void {
  cachedToken = null
}
