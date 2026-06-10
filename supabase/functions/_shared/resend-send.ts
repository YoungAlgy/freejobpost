// Resend transactional-send helper for Deno edge functions.
//
// Replaces _shared/ses.ts for the freejobpost.co / freeresumepost.co
// transactional paths (2026-06-10). Why: the AWS SES account never left
// sandbox — production access was reviewed and DENIED (case 177814045700922),
// so SES rejected every send to a non-verified recipient. Real employers
// never got verify/login/applicant emails. Resend already powers every other
// email path in this project (drip, bulk, digests) and works.
//
// Sender domain: the Resend workspace whose RESEND_API_KEY lives in this
// project has ONLY avahealth.co verified. So all from-addresses here must be
// @avahealth.co until freejobpost.co / freeresumepost.co are added to that
// workspace (DNS records at the registrar). Callers keep their product
// display names ("Free Job Post <jobs@avahealth.co>").
//
// Same params/result shape as _shared/ses.ts so callers swap on the import
// line only. Never throws.

export type SendEmailParams = {
  /** "Display Name <user@domain.com>" — must be an avahealth.co address */
  from: string
  /** Recipient address */
  to: string
  /** Subject line */
  subject: string
  /** HTML body */
  html: string
  /** Plain-text alternative body */
  text: string
  /** Optional Reply-To header (single address) */
  replyTo?: string
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string }

export async function sendTransactionalEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return { ok: false, status: 500, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    let res: Response
    let body: { id?: string; message?: string }
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: params.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        }),
        signal: ctrl.signal,
      })
      body = await res.json().catch(() => ({}))
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: (body.message || JSON.stringify(body)).slice(0, 500) }
    }
    return { ok: true, messageId: body.id || 'unknown' }
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'send threw' }
  }
}
