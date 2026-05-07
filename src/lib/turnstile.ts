// Cloudflare Turnstile server-side verification helper.
//
// Used by every public-facing form's server action to verify the human-or-bot
// token the client widget produced. Without this check, the form is open to
// arbitrary bot submissions (rate-limited at the RPC layer, but unbounded at
// the form-submit layer).
//
// THIS FILE IS MIRRORED ACROSS REPOS. Both freejobpost/src/lib/turnstile.ts
// and freeresumepost/src/lib/turnstile.ts must stay byte-identical. When you
// change anything here, mirror to the sister repo in the same commit. Same
// rationale as src/lib/organization-schema.ts.
//
// Configuration:
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  — public, included in client bundle, ok to expose
//   TURNSTILE_SECRET_KEY            — server-only, never expose
//
// Cloudflare's documented dev keys (free, always-pass / always-block / always-spent):
//   Sitekey  always-pass:   1x00000000000000000000AA
//   Sitekey  always-block:  2x00000000000000000000AB
//   Secret   always-pass:   1x0000000000000000000000000000000AA
//   Secret   always-fail:   2x0000000000000000000000000000000AA
//   Secret   already-spent: 3x0000000000000000000000000000000AA
//
// Failure mode: if TURNSTILE_SECRET_KEY is unset, this helper returns
// {ok: true, configured: false} so forms work in environments where Turnstile
// hasn't been provisioned yet (e.g. preview deploys, local dev without keys).
// Once the secret is set, every call to verifyTurnstileToken enforces the check.

export type TurnstileVerifyResult =
  | { ok: true; configured: boolean; hostname?: string; action?: string }
  | { ok: false; configured: true; errorCodes: string[]; reason: string }

/**
 * Verifies a Turnstile token against Cloudflare's siteverify endpoint.
 * Pass the `cf-turnstile-response` value from the form submission.
 *
 * Tokens expire 300s after issuance and can only be redeemed once. Pass the
 * client IP (from x-forwarded-for or similar) for stricter validation when
 * available — Cloudflare uses it to prevent token relaying.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // Not configured yet — allow form through. Forms still go through their
    // RPC-layer rate limits and other defenses. This lets us deploy the
    // integration before Cloudflare keys are provisioned.
    return { ok: true, configured: false }
  }

  if (!token || typeof token !== 'string' || token.length < 20) {
    return {
      ok: false,
      configured: true,
      errorCodes: ['missing-input-response'],
      reason: 'Bot challenge missing or malformed. Please refresh and try again.',
    }
  }

  const params = new URLSearchParams({ secret, response: token })
  if (remoteIp) params.set('remoteip', remoteIp)

  let cfResponse: Response
  try {
    cfResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      }
    )
  } catch (err) {
    console.error('Turnstile siteverify network error:', err instanceof Error ? err.message : 'unknown')
    // Cloudflare's CF endpoint is highly available, but a transient network
    // failure shouldn't lock all submissions. Fail open with a logged warning
    // — same posture as SES sandbox guard.
    return { ok: true, configured: true }
  }

  if (!cfResponse.ok) {
    console.error('Turnstile siteverify HTTP error:', cfResponse.status)
    return { ok: true, configured: true }
  }

  type CfBody = {
    success: boolean
    'error-codes'?: string[]
    challenge_ts?: string
    hostname?: string
    action?: string
  }
  const body: CfBody = await cfResponse.json()
  if (body.success) {
    return {
      ok: true,
      configured: true,
      hostname: body.hostname,
      action: body.action,
    }
  }

  return {
    ok: false,
    configured: true,
    errorCodes: body['error-codes'] ?? [],
    reason: friendlyReason(body['error-codes'] ?? []),
  }
}

function friendlyReason(codes: string[]): string {
  if (codes.includes('timeout-or-duplicate')) {
    return 'Bot challenge expired or already used. Please refresh the page and try again.'
  }
  if (codes.includes('invalid-input-response')) {
    return 'Bot challenge invalid. Please refresh the page and try again.'
  }
  if (codes.includes('missing-input-response')) {
    return 'Bot challenge missing. Please complete the challenge and resubmit.'
  }
  if (codes.some((c) => c.startsWith('invalid-input-secret') || c.startsWith('missing-input-secret'))) {
    return 'Server misconfiguration. Please try again later.'
  }
  return 'Bot challenge failed. Please refresh and try again.'
}
