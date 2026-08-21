// 2026-08-21: moved here from avahealth-crm/supabase/functions/employer-login-send —
// same reasoning as post-job-verify's header in this repo. No behavior change.
//
// employer-login-send — emails a magic-link to an employer's registered address.
//
// Flow:
//   1. /employer/login POSTs { email } here (anon).
//   2. This fn calls request_employer_login_rpc which mints a nonce row
//      in marketplace_notifications (or no-ops for unknown emails).
//   3. If a nonce came back, we send the magic link via SES. If not,
//      we still return success:true — never leak whether an email is on file.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactionalEmail } from "../_shared/resend-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_NAME = "Free Job Post";
// Resend sender — only avahealth.co is verified in this workspace.
const FROM_EMAIL = "jobs@avahealth.co";
const REPLY_TO = "alex@avahealth.co";
const APP_URL = "https://freejobpost.co";

// Mask an email for ops alerts — enough to recognize the domain
// without putting the whole thing in an external webhook body.
// "jane.doe@example.com" -> "j***@example.com". Same pattern as book-interview.
function maskEmail(addr: string): string {
  const at = addr.indexOf("@");
  if (at < 1) return "***";
  return `${addr[0]}***@${addr.slice(at + 1)}`;
}

// 2026-07-15: invoked via fetch() from freejobpost's /employer/login server
// action, never via pg_cron, so a Resend outage here is invisible to
// cron_health_check/ops-alert. Reuses the same OPS_ALERT_WEBHOOK_URL
// ops-alert already falls back to (same Supabase project). Never throws;
// optional, unset = old behavior.
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
    console.error("employer-login-send: ops webhook failed too:", e instanceof Error ? e.message : e);
  }
}

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // SECURITY 2026-05-30: service-role, not anon. request_employer_login_rpc mints +
    // RETURNS a login nonce; anon EXECUTE is revoked so the nonce can't be harvested via a
    // direct anon RPC call with the public key. This server-side fn calls it with service-role.
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { email } = await req.json() as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await sb.rpc('request_employer_login_rpc', { p_email: email });
    if (error) {
      console.error('request_employer_login_rpc error:', error.message);
      return new Response(JSON.stringify({ success: false, error: "Login request failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = data as {
      success: boolean;
      email_dispatched?: boolean;
      employer_id?: string;
      employer_name?: string;
      company_name?: string;
      employer_email?: string;
      nonce?: string;
      code: number;
      error?: string;
    };

    if (!r.success) {
      return new Response(JSON.stringify({ success: false, error: r.error }), {
        status: r.code || 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always success; only send email if the RPC minted a nonce (employer exists)
    if (!r.email_dispatched || !r.employer_id || !r.nonce || !r.employer_email) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("RESEND_API_KEY")) {
      console.error("employer-login-send: RESEND_API_KEY not configured");
      // Return a user-friendly message so the employer knows what to do.
      return new Response(JSON.stringify({
        success: false,
        error: "Sign-in emails are temporarily unavailable. Email alex@avahealth.co with subject \"Dashboard login help\" and we'll get you in."
      }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Token = base64url("{employer_id}|{nonce}"). Opaque to the client.
    const token = b64url(`${r.employer_id}|${r.nonce}`);
    const magicUrl = `${APP_URL}/employer/verify/${encodeURIComponent(token)}`;

    const displayName = r.employer_name || r.company_name || 'there';
    const safeName = escHtml(displayName);
    const safeMagicUrl = escHtml(magicUrl);
    const subject = 'Sign in to your freejobpost.co dashboard';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in to freejobpost.co</title>
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

  <!-- Headline -->
  <tr>
    <td style="padding:28px 32px 8px;">
      <h1 style="margin:0;font-size:26px;font-weight:900;line-height:1.1;letter-spacing:-0.5px;">
        Your sign-in link.
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">
        Hi ${safeName}, click below to open your employer dashboard. No password required.
      </p>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="padding:0 32px 12px;">
      <a href="${safeMagicUrl}"
         style="display:inline-block;background:#000000;color:#ffffff;padding:14px 28px;font-weight:700;font-size:15px;text-decoration:none;">
        Open dashboard &rarr;
      </a>
    </td>
  </tr>

  <!-- Fallback URL -->
  <tr>
    <td style="padding:0 32px 28px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Or paste this URL:</p>
      <p style="margin:0;font-size:11px;color:#6b7280;font-family:monospace;word-break:break-all;">${safeMagicUrl}</p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:2px solid #000000;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        This link stays active for 30 days. Didn't request this? Ignore it. Your account is unchanged.<br/>
        freejobpost.co is operated by Ava Health Partners LLC &middot; 4532 W Kennedy Blvd Ste 125, Tampa FL 33609
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = `Hi ${displayName},

Click below to sign in to your freejobpost.co employer dashboard:

${magicUrl}

This link stays active for 30 days. Didn't request this? Ignore it. Your account is unchanged.

freejobpost.co is operated by Ava Health Partners LLC`;

    const sendResult = await sendTransactionalEmail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: r.employer_email,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    });
    if (!sendResult.ok) {
      console.error('Resend send failed:', sendResult.status, sendResult.error.slice(0, 200));
      await alertOpsViaWebhook(
        `employer-login-send: magic-link email failed`,
        `Employer id-prefix: ${String(r.employer_id).slice(0, 8)}\nEmail: ${maskEmail(r.employer_email)}\nResend error: ${sendResult.status} ${sendResult.error.slice(0, 300)}\n\nThis employer is locked out of their dashboard until they get this email or you help them another way. Look up public_employers by that id-prefix for the full contact. Not covered by cron_health_check since this is invoked via fetch, not pg_cron.`,
      );
      return new Response(JSON.stringify({ success: false, error: "Email delivery failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message_id: sendResult.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("employer-login-send error:", err instanceof Error ? err.message : 'unknown');
    return new Response(JSON.stringify({ success: false, error: "Login request failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
