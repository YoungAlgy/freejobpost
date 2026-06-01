// Mailchimp audience-add for job-alert capture. ENV-GATED + FAIL-SOFT: returns
// false (no-op) unless MAILCHIMP_API_KEY + MAILCHIMP_AUDIENCE_ID are set. The
// CRM row (public_job_alert_subscribers) is the source of truth + the moat;
// Mailchimp is the downstream alert-send channel. PUT-upsert keyed on the email
// hash → idempotent (re-subscribing the same email never errors).
//
// Setup when ready: create the audience, add merge fields SPECIALTY / STATE /
// CITY / SOURCE, then set MAILCHIMP_API_KEY (format "<key>-<dc>", e.g. ...-us21)
// and MAILCHIMP_AUDIENCE_ID in the Vercel env. No code change needed.
import { createHash } from 'crypto'

const API_KEY = process.env.MAILCHIMP_API_KEY
const AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID

type MergeFields = { specialty?: string; state?: string; city?: string; source?: string }

export async function addToMailchimpAudience(
  email: string,
  fields: MergeFields,
): Promise<boolean> {
  if (!API_KEY || !AUDIENCE_ID) return false // not configured → no-op
  const dc = API_KEY.split('-')[1] // key format "<key>-<dc>"
  if (!dc) return false

  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex')
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${AUDIENCE_ID}/members/${hash}`

  const res = await fetch(url, {
    method: 'PUT', // upsert — won't 400 on an existing member
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      email_address: email,
      status_if_new: 'subscribed', // single opt-in; 'pending' = double opt-in
      merge_fields: {
        SPECIALTY: fields.specialty || '',
        STATE: fields.state || '',
        CITY: fields.city || '',
        SOURCE: fields.source || '',
      },
    }),
    signal: AbortSignal.timeout(5000),
  })

  if (!res.ok) {
    console.error('mailchimp add failed:', res.status)
    return false
  }
  return true
}
