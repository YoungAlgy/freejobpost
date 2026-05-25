// AWS SES SendEmail helper for Deno edge functions.
//
// Replaces the Resend integration we used 2026-04-24 → 2026-05-02. Reasons
// for the migration are documented in the strategic plan; the short version:
// SES is free for multiple custom domains, scales cheaper, and matches the
// multi-year ambition for the freeresumepost.co + freejobpost.co properties.
//
// This module hand-rolls SigV4 v4 request signing instead of pulling in the
// AWS SDK. The full @aws-sdk/client-ses package is ~250KB even after
// tree-shaking and pulls in many transitive deps; for one endpoint
// (SendEmail) the manual signature is ~80 lines and zero deps. Easier to
// audit, faster cold-start in Deno edge runtime.
//
// Required Supabase Edge Function secrets:
//   AWS_ACCESS_KEY_ID        — IAM user access key
//   AWS_SECRET_ACCESS_KEY    — IAM user secret
//   AWS_REGION               — defaults to 'us-east-1'
//
// IAM permissions needed (minimum):
//   ses:SendEmail, ses:SendRawEmail
//
// References:
//   https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
//   https://docs.aws.amazon.com/ses/latest/APIReference/API_SendEmail.html

export type SendEmailParams = {
  /** "Display Name" or "Display Name <user@domain.com>" — the From header */
  from: string
  /** Recipient address; multiple recipients via separate calls is fine for our volume */
  to: string
  /** Subject line */
  subject: string
  /** HTML body */
  html: string
  /** Plain-text alternative body */
  text: string
  /** Optional Reply-To header (single address) */
  replyTo?: string
  /** Optional configuration set name (for tagging / dedicated IP / suppression list) */
  configurationSetName?: string
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string }

/**
 * Sends an email via Amazon SES. Returns ok+messageId on success, or
 * ok:false+error on any failure. Never throws — callers can decide whether
 * to surface the failure.
 */
export async function sendSesEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const accessKey = Deno.env.get('AWS_ACCESS_KEY_ID')
  const secretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY')
  const region = Deno.env.get('AWS_REGION') || 'us-east-1'

  if (!accessKey || !secretKey) {
    return { ok: false, status: 500, error: 'AWS credentials not configured' }
  }

  const formParams: Record<string, string> = {
    'Action': 'SendEmail',
    'Source': params.from,
    'Destination.ToAddresses.member.1': params.to,
    'Message.Subject.Data': params.subject,
    'Message.Subject.Charset': 'UTF-8',
    'Message.Body.Html.Data': params.html,
    'Message.Body.Html.Charset': 'UTF-8',
    'Message.Body.Text.Data': params.text,
    'Message.Body.Text.Charset': 'UTF-8',
    'Version': '2010-12-01',
  }
  if (params.replyTo) {
    formParams['ReplyToAddresses.member.1'] = params.replyTo
  }
  if (params.configurationSetName) {
    formParams['ConfigurationSetName'] = params.configurationSetName
  }

  const body = new URLSearchParams(formParams).toString()
  const host = `email.${region}.amazonaws.com`
  const url = `https://${host}/`

  const headers = await signSigV4Request({
    method: 'POST',
    host,
    path: '/',
    body,
    region,
    service: 'email',
    accessKey,
    secretKey,
    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
  })

  const res = await fetch(url, { method: 'POST', headers, body })
  const text = await res.text()

  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 500) }
  }

  // SES SendEmail returns XML like:
  //   <SendEmailResponse><SendEmailResult><MessageId>...</MessageId>...
  const messageId = text.match(/<MessageId>([^<]+)<\/MessageId>/)?.[1] || 'unknown'
  return { ok: true, messageId }
}

// ─── SigV4 v4 request signing (minimal, SES-specific) ──────────────────────

type SignParams = {
  method: 'POST'
  host: string
  path: string
  body: string
  region: string
  service: string
  accessKey: string
  secretKey: string
  contentType: string
}

async function signSigV4Request(p: SignParams): Promise<Record<string, string>> {
  const now = new Date()
  const amzDate = toAmzDate(now) // 20260502T173000Z
  const dateStamp = amzDate.slice(0, 8) // 20260502

  const payloadHash = await sha256Hex(p.body)

  // Canonical request
  const canonicalHeaders =
    `content-type:${p.contentType}\n` +
    `host:${p.host}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const canonicalRequest = [
    p.method,
    p.path,
    '', // query string (empty for SES POST)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // String to sign
  const credentialScope = `${dateStamp}/${p.region}/${p.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  // Derive signing key
  const kDate = await hmacSha256Bytes(`AWS4${p.secretKey}`, dateStamp)
  const kRegion = await hmacSha256Bytes(kDate, p.region)
  const kService = await hmacSha256Bytes(kRegion, p.service)
  const kSigning = await hmacSha256Bytes(kService, 'aws4_request')

  // Sign string
  const signature = await hmacSha256Hex(kSigning, stringToSign)

  return {
    'Content-Type': p.contentType,
    'Host': p.host,
    'X-Amz-Date': amzDate,
    'Authorization':
      `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

function toAmzDate(d: Date): string {
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return iso // YYYYMMDDTHHmmssZ
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return bytesToHex(new Uint8Array(buf))
}

async function hmacSha256Bytes(key: string | Uint8Array, data: string): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

async function hmacSha256Hex(key: Uint8Array, data: string): Promise<string> {
  const bytes = await hmacSha256Bytes(key, data)
  return bytesToHex(bytes)
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}
