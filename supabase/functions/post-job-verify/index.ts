// 2026-08-21: moved here from avahealth-crm/supabase/functions/post-job-verify —
// this always served freejobpost's own /post-job/verify flow and had no real
// reason to live in the CRM's repo. freejobpost's code has always called this
// function by name with no local source to back it, a landmine found while
// scoping freejobpost's move to its own Supabase project. No behavior change.
//
// post-job-verify — consumes the HMAC verify token issued by post-job-send-verify.
//
// Flow:
//   1. /post-job/verify/[token] server page POSTs { token } here.
//   2. This fn verifies the HMAC signature + expiry, decodes payload.
//   3. Calls consume_post_job_verification_rpc to atomically flip the
//      employer/job to verified/active (idempotent via nonce stored in
//      marketplace_notifications).
//   4. On first verification (was_already_verified=false), sends "your job is live"
//      welcome email to the employer via SES (non-blocking — email failure
//      never causes the verification response to fail).
//   5. Returns { success, was_already_verified, job_slug } so the page can
//      render the right message + redirect to the live listing.
//
// Security:
//   - No JWT (public endpoint).
//   - ALL trust lives in the HMAC check below + the SECURITY DEFINER RPC.
//   - Constant-time signature comparison.
//   - Uses SERVICE_ROLE_KEY for the consume RPC. The RPC's nonce is an idempotency
//     key, not a credential (it never checks the nonce was issued), so anon EXECUTE
//     on it let a caller skip the HMAC check by hitting PostgREST directly. anon
//     EXECUTE is revoked and this function is the only caller.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactionalEmail } from "../_shared/resend-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlDecodeToString(s: string): string {
  return new TextDecoder().decode(b64urlDecode(s));
}

function b64urlFromBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 2026-07-15: invoked via fetch() from freejobpost's /post-job/verify page,
// never via pg_cron, so a Resend outage here is invisible to
// cron_health_check/ops-alert. This "your job is live" welcome email
// already failed silently by design (never blocks verification) — this
// just makes that failure visible. Reuses the same OPS_ALERT_WEBHOOK_URL
// ops-alert already falls back to. Never throws; optional, unset = old
// behavior.
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
    console.error("post-job-verify: ops webhook failed too:", e instanceof Error ? e.message : e);
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

async function hmacVerify(secret: string, body: string, sig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expectedStr = b64urlFromBytes(expected);
  // Constant-time compare
  if (expectedStr.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedStr.length; i++) {
    diff |= expectedStr.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

function jobLiveEmailHtml(params: {
  employerName: string;
  jobTitle: string;
  jobSlug: string;
  dashboardLoginUrl: string;
}): string {
  const { employerName, jobTitle, jobSlug, dashboardLoginUrl } = params;
  const jobUrl = `https://freejobpost.co/jobs/${jobSlug}`;
  const safeOrgName = employerName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTitle = jobTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your job is live on freejobpost.co</title>
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
        <span style="display:inline-block;width:8px;height:8px;background:#16a34a;"></span>
        LIVE
      </span>
    </td>
  </tr>

  <!-- Headline -->
  <tr>
    <td style="padding:16px 32px 8px;">
      <h1 style="margin:0;font-size:28px;font-weight:900;line-height:1.1;letter-spacing:-0.5px;">
        Your job is live.
      </h1>
    </td>
  </tr>

  <!-- Subhead -->
  <tr>
    <td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">
        <strong>${safeTitle}</strong> is now visible to candidates and has been
        submitted to Google for Jobs. Applications go straight to your inbox.
        No middleman, no unlock fee.
      </p>
    </td>
  </tr>

  <!-- CTA — View listing -->
  <tr>
    <td style="padding:0 32px 12px;">
      <a href="${jobUrl}"
         style="display:inline-block;background:#000000;color:#ffffff;padding:12px 24px;font-weight:700;font-size:14px;text-decoration:none;">
        View your listing →
      </a>
    </td>
  </tr>

  <!-- Secondary CTA — Dashboard -->
  <tr>
    <td style="padding:0 32px 32px;">
      <a href="${dashboardLoginUrl}"
         style="display:inline-block;border:2px solid #000;color:#000;padding:10px 24px;font-weight:700;font-size:14px;text-decoration:none;">
        Manage from your dashboard →
      </a>
    </td>
  </tr>

  <!-- What happens next -->
  <tr>
    <td style="padding:24px 32px 28px;border-top:2px solid #000000;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">
        What happens next
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#374151;vertical-align:top;">
            <strong>Applications:</strong> candidates apply directly through freejobpost.co and the email goes straight to you. No fees, no screening, no "unlock" charge.
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#374151;vertical-align:top;">
            <strong>Syndication:</strong> your role is in the Google for Jobs feed and the Indeed organic index. Expect indexing within 4 to 24 hours.
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#374151;vertical-align:top;">
            <strong>Duration:</strong> live for 90 days. Log in to renew, edit, or close it anytime.
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:2px solid #000000;background:#f9fafb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        freejobpost.co is operated by Ava Health Partners LLC · 4532 W Kennedy Blvd Ste 125, Tampa FL 33609<br/>
        Questions? Reply to this email or contact <a href="mailto:alex@avahealth.co" style="color:#374151;">alex@avahealth.co</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function jobLiveEmailText(params: {
  employerName: string;
  jobTitle: string;
  jobSlug: string;
  dashboardLoginUrl: string;
}): string {
  const { jobTitle, jobSlug, dashboardLoginUrl } = params;
  const jobUrl = `https://freejobpost.co/jobs/${jobSlug}`;
  return `Your job is live on freejobpost.co

"${jobTitle}" is now visible to candidates. Applications go straight to your inbox.

View your listing: ${jobUrl}
Manage from your dashboard: ${dashboardLoginUrl}

What happens next:
- Applications: candidates apply directly and the email goes straight to you. No fees.
- Syndication: your role is in Google for Jobs and the Indeed organic index (4-24 hr indexing).
- Duration: live for 90 days. Log in to renew, edit, or close it anytime.

freejobpost.co is operated by Ava Health Partners LLC
Questions? alex@avahealth.co
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const SECRET = Deno.env.get("MARKETPLACE_VERIFY_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SECRET) {
      console.error("post-job-verify: MARKETPLACE_VERIFY_SECRET not set");
      return new Response(JSON.stringify({ success: false, error: "Server misconfigured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token } = await req.json() as { token?: string };
    if (!token || typeof token !== 'string' || token.length > 1024) {
      return new Response(JSON.stringify({ success: false, error: "Missing or malformed token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dot = token.indexOf('.');
    if (dot < 1 || dot === token.length - 1) {
      return new Response(JSON.stringify({ success: false, error: "Malformed token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const ok = await hmacVerify(SECRET, payloadB64, sig);
    if (!ok) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: { e?: string; j?: string; n?: string; x?: number };
    try {
      payload = JSON.parse(b64urlDecodeToString(payloadB64));
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Malformed token payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { e: employer_id, j: job_id, n: nonce, x: exp } = payload;
    if (!employer_id || !job_id || !nonce || !exp) {
      return new Response(JSON.stringify({ success: false, error: "Incomplete token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (exp < Math.floor(Date.now() / 1000)) {
      return new Response(JSON.stringify({ success: false, error: "Token expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY 2026-08-20: the RPC's nonce is only an idempotency key — it never checks
    // the nonce was ever issued, so anon EXECUTE meant anyone with an employer_id +
    // job_id could publish a pending job with an arbitrary 8-char string, skipping the
    // HMAC check above entirely. anon EXECUTE is now revoked and this is the only caller,
    // so it runs service-role. Same client also clears the public_employers
    // tier/status self-promotion trigger on the first-time pending -> active flip.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: rpcResult, error: rpcErr } = await sb.rpc('consume_post_job_verification_rpc', {
      p_employer_id: employer_id,
      p_job_id: job_id,
      p_nonce: nonce,
    });

    if (rpcErr) {
      console.error("consume_post_job_verification_rpc error:", rpcErr.message);
      return new Response(JSON.stringify({ success: false, error: "Verification failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = rpcResult as {
      success: boolean;
      error?: string;
      code: number;
      was_already_verified?: boolean;
      job_slug?: string;
      employer_contact_email?: string;
      employer_name?: string;
      job_title?: string;
    };

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: result.code || 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send "your job is live" welcome email on first verification only.
    // Non-blocking: email failure never causes the verification response to fail.
    if (!result.was_already_verified && result.employer_contact_email && result.job_slug) {
      const sesOk = !!Deno.env.get("RESEND_API_KEY");
      if (sesOk) {
        // Mint a one-click dashboard login link so the employer doesn't need a
        // second email round-trip. request_employer_login_rpc returns a nonce
        // that we embed as a magic-link URL. Failure falls back to /employer/login.
        let dashboardLoginUrl = "https://freejobpost.co/employer/login";
        try {
          // SECURITY 2026-05-30: anon EXECUTE on request_employer_login_rpc is revoked (it
          // returns a login nonce). Call it with a service-role client; the verify RPC above
          // intentionally stays anon. On failure this still falls back gracefully below.
          const sbAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const { data: loginData } = await sbAdmin.rpc('request_employer_login_rpc', {
            p_email: result.employer_contact_email,
          });
          const lr = loginData as {
            success: boolean;
            email_dispatched?: boolean;
            employer_id?: string;
            nonce?: string;
          } | null;
          if (lr?.success && lr.employer_id && lr.nonce) {
            const raw = `${lr.employer_id}|${lr.nonce}`;
            const token = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            dashboardLoginUrl = `https://freejobpost.co/employer/verify/${encodeURIComponent(token)}`;
          }
        } catch (loginErr) {
          console.warn("post-job-verify: couldn't mint dashboard token:", loginErr instanceof Error ? loginErr.message : 'unknown');
        }

        const emailParams = {
          employerName: result.employer_name ?? 'there',
          jobTitle: result.job_title ?? 'Your role',
          jobSlug: result.job_slug,
          dashboardLoginUrl,
        };
        try {
          await sendTransactionalEmail({
            from: "Free Job Post <jobs@avahealth.co>",
            to: result.employer_contact_email,
            replyTo: "alex@avahealth.co",
            subject: `Your job is live: ${result.job_title ?? 'Healthcare role'}`,
            html: jobLiveEmailHtml(emailParams),
            text: jobLiveEmailText(emailParams),
          });
          // Don't log the recipient address — same no-PII-in-logs rule the other
          // notify functions follow. The employer name is enough to trace this.
          console.log(`post-job-verify: welcome email sent (employer: ${result.employer_name ?? "(no name)"})`);
        } catch (emailErr) {
          // Log but never let email failure surface to the caller
          console.error("post-job-verify: welcome email failed:", emailErr instanceof Error ? emailErr.message : 'unknown');
          await alertOpsViaWebhook(
            `post-job-verify: "your job is live" welcome email failed`,
            `Employer id-prefix: ${String(employer_id).slice(0, 8)}\nEmail: ${maskEmail(result.employer_contact_email)}\nJob: ${result.job_title ?? "(no title)"}\nError: ${emailErr instanceof Error ? emailErr.message : "unknown"}\n\nThe job itself verified fine and is live — only the welcome/dashboard-link email failed. Low urgency, but they won't have the one-click dashboard login link from this email. Look up public_employers by that id-prefix for the full contact.`,
          );
        }
      } else {
        console.log("post-job-verify: email not configured, skipping welcome email");
      }
    }

    return new Response(JSON.stringify({
      success: true,
      was_already_verified: result.was_already_verified,
      job_slug: result.job_slug,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("post-job-verify error:", err instanceof Error ? err.message : 'unknown');
    return new Response(JSON.stringify({ success: false, error: "Unable to verify. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
