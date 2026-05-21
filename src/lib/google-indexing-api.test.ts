import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import {
  signGoogleJwt,
  notifyGoogleIndexingApi,
  notifyGoogleForJob,
  _resetGoogleIndexingCache,
} from './google-indexing-api'

// Generate a real RSA key pair once for all tests — Google uses RS256
// JWTs so we need an actual private key (not a mock string).
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const FAKE_SERVICE_ACCOUNT = {
  client_email: 'indexing-bot@freejobpost-test.iam.gserviceaccount.com',
  private_key: privateKey,
}

describe('signGoogleJwt', () => {
  it('produces a three-segment JWT', () => {
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, 1700000000)
    expect(jwt.split('.').length).toBe(3)
  })

  it('uses RS256 header alg + JWT typ', () => {
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, 1700000000)
    const [headerSeg] = jwt.split('.')
    const header = JSON.parse(Buffer.from(headerSeg, 'base64url').toString('utf8'))
    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
  })

  it('claims iss = client_email, aud = oauth2 token endpoint, scope = indexing', () => {
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, 1700000000)
    const [, claimsSeg] = jwt.split('.')
    const claims = JSON.parse(Buffer.from(claimsSeg, 'base64url').toString('utf8'))
    expect(claims.iss).toBe(FAKE_SERVICE_ACCOUNT.client_email)
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token')
    expect(claims.scope).toBe('https://www.googleapis.com/auth/indexing')
  })

  it('iat = nowSec, exp = nowSec + 3600 (matches Google spec)', () => {
    const nowSec = 1700000000
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, nowSec)
    const [, claimsSeg] = jwt.split('.')
    const claims = JSON.parse(Buffer.from(claimsSeg, 'base64url').toString('utf8'))
    expect(claims.iat).toBe(nowSec)
    expect(claims.exp).toBe(nowSec + 3600)
  })

  it('signature verifies against the public key — proves we used the right private key', () => {
    // If the signing algorithm or key encoding were wrong, the public-
    // key verify step would reject the signature. This test catches
    // regressions to the JWT-bearer flow that would otherwise only
    // show up as a 400 from Google's OAuth2 endpoint.
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, 1700000000)
    const [headerSeg, claimsSeg, sigSeg] = jwt.split('.')
    const signingInput = `${headerSeg}.${claimsSeg}`
    const sig = Buffer.from(sigSeg, 'base64url')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(signingInput)
    verifier.end()
    expect(verifier.verify(publicKey, sig)).toBe(true)
  })

  it('uses base64url encoding (no padding, - + _ instead of + /)', () => {
    const jwt = signGoogleJwt(FAKE_SERVICE_ACCOUNT, 1700000000)
    // base64url forbids '+', '/', and trailing '=' padding chars
    expect(jwt).not.toMatch(/[+/=]/)
  })
})

describe('notifyGoogleIndexingApi (env not set)', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    _resetGoogleIndexingCache()
  })

  it('returns false when GOOGLE_SERVICE_ACCOUNT_JSON is unset (no-op activation gate)', async () => {
    const ok = await notifyGoogleIndexingApi(
      'https://freejobpost.co/jobs/x'
    )
    expect(ok).toBe(false)
  })

  it('returns false when the env var is malformed JSON', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = 'not-valid-json'
    const ok = await notifyGoogleIndexingApi(
      'https://freejobpost.co/jobs/x'
    )
    expect(ok).toBe(false)
  })

  it('returns false when the JSON is missing client_email or private_key', async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'x@x.iam.gserviceaccount.com',
      // missing private_key
    })
    const ok = await notifyGoogleIndexingApi(
      'https://freejobpost.co/jobs/x'
    )
    expect(ok).toBe(false)
  })
})

describe('notifyGoogleIndexingApi (env set, fetch mocked)', () => {
  beforeEach(() => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_SERVICE_ACCOUNT)
    _resetGoogleIndexingCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    _resetGoogleIndexingCache()
  })

  it('exchanges JWT for token, then POSTs to indexing.googleapis.com', async () => {
    const tokenFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'ya29.fake', expires_in: 3599 }),
      text: async () => '',
    })
    const publishFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        callCount += 1
        const url = typeof args[0] === 'string' ? args[0] : args[0].toString()
        if (url.includes('oauth2.googleapis.com')) return tokenFetch(...args)
        if (url.includes('indexing.googleapis.com')) return publishFetch(...args)
        throw new Error(`unexpected fetch: ${url}`)
      })
    )

    const ok = await notifyGoogleIndexingApi(
      'https://freejobpost.co/jobs/cardiology-md-tampa'
    )
    expect(ok).toBe(true)
    expect(callCount).toBe(2) // token + publish

    // Verify the publish call had the right shape
    const [publishUrl, publishOpts] = publishFetch.mock.calls[0]
    expect(publishUrl).toBe(
      'https://indexing.googleapis.com/v3/urlNotifications:publish'
    )
    expect(publishOpts.headers.Authorization).toBe('Bearer ya29.fake')
    expect(JSON.parse(publishOpts.body)).toEqual({
      url: 'https://freejobpost.co/jobs/cardiology-md-tampa',
      type: 'URL_UPDATED',
    })
  })

  it('caches the access token across calls — second publish skips the token endpoint', async () => {
    let tokenCalls = 0
    let publishCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0].toString()
        if (url.includes('oauth2.googleapis.com')) {
          tokenCalls += 1
          return {
            ok: true,
            json: async () => ({ access_token: 'ya29.fake', expires_in: 3599 }),
            text: async () => '',
          } as Response
        }
        if (url.includes('indexing.googleapis.com')) {
          publishCalls += 1
          return {
            ok: true,
            json: async () => ({}),
            text: async () => '',
          } as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      })
    )

    await notifyGoogleIndexingApi('https://freejobpost.co/jobs/a')
    await notifyGoogleIndexingApi('https://freejobpost.co/jobs/b')
    await notifyGoogleIndexingApi('https://freejobpost.co/jobs/c')

    expect(tokenCalls).toBe(1) // token fetched once, cached for the next 2
    expect(publishCalls).toBe(3)
  })

  it('returns false (and invalidates token cache) on 401 publish response', async () => {
    let tokenCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0].toString()
        if (url.includes('oauth2.googleapis.com')) {
          tokenCalls += 1
          return {
            ok: true,
            json: async () => ({ access_token: `ya29.fake-${tokenCalls}`, expires_in: 3599 }),
            text: async () => '',
          } as Response
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({}),
          text: async () => 'unauthorized',
        } as Response
      })
    )

    const ok1 = await notifyGoogleIndexingApi('https://freejobpost.co/jobs/x')
    expect(ok1).toBe(false)

    // After a 401, the next call should re-fetch the token (cache invalidated)
    await notifyGoogleIndexingApi('https://freejobpost.co/jobs/y')
    expect(tokenCalls).toBe(2)
  })
})

describe('notifyGoogleForJob', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    _resetGoogleIndexingCache()
  })

  it('builds the canonical /jobs/[slug] URL', async () => {
    // With env unset, this returns false without touching the network —
    // but we want to assert the URL-build behavior exists. So we mock
    // notifyGoogleIndexingApi via the fetch path with env set.
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(FAKE_SERVICE_ACCOUNT)
    let publishedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        const url = typeof args[0] === 'string' ? args[0] : args[0].toString()
        if (url.includes('oauth2.googleapis.com')) {
          return {
            ok: true,
            json: async () => ({ access_token: 'ya29.fake', expires_in: 3599 }),
            text: async () => '',
          } as Response
        }
        if (url.includes('indexing.googleapis.com')) {
          const opts = args[1] as RequestInit
          const body = JSON.parse(opts.body as string)
          publishedUrl = body.url
          return { ok: true, json: async () => ({}), text: async () => '' } as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      })
    )

    await notifyGoogleForJob('cardiology-md-tampa-wd-R12345')
    expect(publishedUrl).toBe(
      'https://freejobpost.co/jobs/cardiology-md-tampa-wd-R12345'
    )

    vi.restoreAllMocks()
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  })
})
