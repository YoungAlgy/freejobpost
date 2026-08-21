// 2026-08-21: moved here from avahealth-crm/supabase/functions/post-job-send-verify —
// same reasoning as post-job-verify's header in this repo. No behavior change.
//
// post-job-send-verify — issues an HMAC-signed verification link + emails it.
//
// Called by the freejobpost.co /post-job server action after it has inserted
// public_employers + public_jobs (with status='pending_review'). This edge fn
// mints a short, signed token and emails a one-click verify URL. Once the
// employer clicks, post-job-verify (a separate edge fn) consumes the token.
//
// Security:
//   - No JWT required; deploy with --no-verify-jwt.
//   - MARKETPLACE_VERIFY_SECRET (Supabase secret) is the HMAC key.
//   - Token payload is server-generated only. Expiry is 48h.
//   - Nonce is a 128-bit random value stored in the token; replay protection
//     is enforced at consume time via marketplace_notifications (see
//     consume_post_job_verification_rpc).
//   - Rate limit: 3 verify emails per employer_email per 24h (cheap check).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactionalEmail } from "../_shared/resend-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_NAME = "Free Job Post";
// Sends via Resend (see _shared/resend-send.ts) — only avahealth.co is a
// verified sending domain in this workspace, so the address lives there.
// Replies route to the monitored inbox via REPLY_TO.
const FROM_EMAIL = "jobs@avahealth.co";
const REPLY_TO = "alex@avahealth.co";
const APP_URL = "https://freejobpost.co";
const TOKEN_TTL_SECONDS = 48 * 3600;

// 2026-07-15: invoked via fetch() from freejobpost's /post-job server
// action, never via pg_cron, so a Resend outage here is invisible to
// cron_health_check/ops-alert. This is the ONLY way an employer's job ever
// goes live — no fallback meant no automatic recovery and no visibility.
// Reuses the same OPS_ALERT_WEBHOOK_URL ops-alert already falls back to
// (same Supabase project). Never throws; optional, unset = old behavior.
async function alertOpsViaWebhook(subject: string, body: string): Promise<void> {
  try {
    const url = Deno.env.get("OPS_ALERT_WEBHOOK_URL");
    if (!url) return;
    const message = `**[ava ops alert]** ${subject}\n\n${body}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message, text: message }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error("post-job-send-verify: ops webhook failed too:", e instanceof Error ? e.message : e);
  }
}

// Mask an email for ops alerts — enough to recognize the domain
// without putting the whole thing in an external webhook body.
// "jane.doe@example.com" -> "j***@example.com". Same pattern as book-interview.
function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 1) return "***";
  return `${addr[0]}***@${addr.slice(at + 1)}`;
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return b64url(sig);
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const SECRET = Deno.env.get("MARKETPLACE_VERIFY_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SECRET) {
      console.error("post-job-send-verify: MARKETPLACE_VERIFY_SECRET not set");
      return new Response(JSON.stringify({ success: false, error: "Server misconfigured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      employer_id,
      job_id,
      employer_email,
      employer_name,
      job_title,
    } = body as {
      employer_id?: string;
      job_id?: string;
      employer_email?: string;
      employer_name?: string;
      job_title?: string;
    };

    if (!employer_id || !job_id || !employer_email || !job_title) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employer_email) || employer_email.length > 254) {
      return new Response(JSON.stringify({ success: false, error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit — 3 verify sends per employer_email per 24h, counted on
    // public_employers rows sharing this email. Must run with service_role:
    // public_employers has RLS with no anon SELECT, so the previous anon
    // client always got count=null and the limit never fired (dead since
    // v1). Good enough as a casual-abuse brake.
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { count } = await sb
      .from('public_employers')
      .select('id', { count: 'exact', head: true })
      .eq('contact_email', employer_email.toLowerCase())
      .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString());
    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ success: false, error: "Too many verification emails requested for this address. Please check your inbox." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nonce = randomHex(16); // 128-bit
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const payload = JSON.stringify({
      e: employer_id,
      j: job_id,
      n: nonce,
      x: exp,
    });
    const payloadB64 = b64urlStr(payload);
    const sig = await hmacSign(SECRET, payloadB64);
    const token = `${payloadB64}.${sig}`;
    const verifyUrl = `${APP_URL}/post-job/verify/${encodeURIComponent(token)}`;

    if (!Deno.env.get("RESEND_API_KEY")) {
      console.error("post-job-send-verify: RESEND_API_KEY not set; token generated but email not sent");
      return new Response(JSON.stringify({ success: false, error: "Email service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `Verify and publish: ${job_title}`;
    const safeOrgName = escHtml(employer_name || 'there');
    const safeTitle = escHtml(job_title);
    const safeUrl = escHtml(verifyUrl);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verify your job post</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px solid #000000;max-width:560px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="padding:28px 32px 20px;border-bottom:2px solid #000000;">
      <p style="margin:0;font-size:18px;font-weight:900;letter-spacing:-0.5px;">
        freejobpost<span style="color:#15803d;">.co</span>
      </p>
    </td>
  </tr>

  <!-- Status pill -->
  <tr>
    <td style="padding:24px 32px 0;">
      <span style="display:inline-flex;align-items:center;gap:6px;border:2px solid #000;padding:4px 10px;font-size:10px;font-weight:700;letter-spacing:0.1em;">
        <span style="display:inline-block;width:8px;height:8px;background:#ca8a04;"></span>
        ONE CLICK TO PUBLISH
      </span>
    </td>
  </tr>

  <!-- Headline -->
  <tr>
    <td style="padding:16px 32px 8px;">
      <h1 style="margin:0;font-size:28px;font-weight:900;line-height:1.1;letter-spacing:-0.5px;">
        Verify and go live.
      </h1>
    </td>
  </tr>

  <!-- Subhead -->
  <tr>
    <td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">
        Hi ${safeOrgName}, click the button below to confirm your email and publish
        <strong>${safeTitle}</strong> on freejobpost.co. The job goes live immediately.
      </p>
    </td>
  </tr>

  <!-- Primary CTA -->
  <tr>
    <td style="padding:0 32px 24px;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#000000;color:#ffffff;padding:14px 28px;font-weight:700;font-size:15px;text-decoration:none;">
        Verify and publish →
      </a>
    </td>
  </tr>

  <!-- Fallback URL -->
  <tr>
    <td style="padding:0 32px 28px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Or paste this URL:</p>
      <p style="margin:0;font-size:11px;color:#6b7280;font-family:monospace;word-break:break-all;">${safeUrl}</p>
    </td>
  </tr>

  <!-- What happens after -->
  <tr>
    <td style="padding:20px 32px 24px;border-top:2px solid #000000;background:#f9fafb;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">After you verify</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">
        <li>Your job is searchable on freejobpost.co immediately</li>
        <li>Submitted to Google for Jobs + Indeed organic index</li>
        <li>Applications go directly to your inbox. No fees, no screening</li>
      </ul>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:2px solid #000000;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        This link expires in 48 hours. Didn't post this job? You can safely ignore this email.<br/>
        freejobpost.co is operated by Ava Health Partners LLC · 4532 W Kennedy Blvd Ste 125, Tampa FL 33609
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${employer_name || 'there'},

Click the link below to verify your email and publish "${job_title}" on freejobpost.co:

${verifyUrl}

After verification:
- Your job is live on freejobpost.co immediately
- Submitted to Google for Jobs + Indeed organic index
- Applications go directly to your inbox (no fees)

This link expires in 48 hours. Didn't post this job? Ignore this email.

freejobpost.co is operated by Ava Health Partners LLC`;

    const sendResult = await sendTransactionalEmail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: employer_email,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    });
    if (!sendResult.ok) {
      console.error("Resend send failed:", sendResult.status, sendResult.error.slice(0, 200));
      await alertOpsViaWebhook(
        `post-job-send-verify: verification email failed`,
        `Employer id-prefix: ${String(employer_id).slice(0, 8)}\nJob id-prefix: ${String(job_id).slice(0, 8)}\nEmail: ${maskEmail(employer_email)}\nJob: ${job_title}\nResend error: ${sendResult.status} ${sendResult.error.slice(0, 300)}\n\nThis employer's job post is stuck pending_review — they can't publish until they get this email (or you manually verify them). Look up public_employers/public_jobs by those id-prefixes for the full contact. Not covered by cron_health_check since this is invoked via fetch, not pg_cron.`,
      );
      return new Response(JSON.stringify({ success: false, error: "Email delivery failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: sendResult.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("post-job-send-verify error:", err instanceof Error ? err.message : 'unknown');
    return new Response(JSON.stringify({ success: false, error: "Unable to send verification email. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
