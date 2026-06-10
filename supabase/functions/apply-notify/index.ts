// apply-notify — fires two emails after apply_to_job_rpc returns success.
//
// 1. Employer: "You have a new applicant for [role]. Reply directly to reach them."
// 2. Candidate: "Your application to [role] is in. Here's what happens next."
//
// No JWT required; deploy with --no-verify-jwt. Inputs are non-sensitive
// display strings the Next.js server action already has from the RPC response.
// We deliberately re-derive the recipients server-side here (via the
// candidate_id + job_id passed in) so a malicious client can't spoof emails.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTransactionalEmail, type SendEmailParams, type SendEmailResult } from "../_shared/resend-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_NAME = "Free Job Post";
// Resend sender — only avahealth.co is verified in this workspace.
const FROM_EMAIL = "jobs@avahealth.co";

// #15: wrap the send so a network-level THROW in one send can't abort the others.
// This fn sends 2 emails; previously a fetch throw on the employer send fell through to
// the outer catch and dropped the candidate's confirmation. Convert a throw to a
// {ok:false} result so each send is isolated.
async function safeSend(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    return await sendTransactionalEmail(params);
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "send threw" };
  }
}

function escHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildEmployerHtml(params: {
  jobTitle: string;
  loc: string;
  candidateName: string;
  credential: string | null;
  email: string;
  phone: string | null;
  specialty: string | null;
  coverNote: string | null;
  publicProfileUrl: string | null;
  firstName: string;
}): string {
  const { jobTitle, loc, candidateName, credential, email, phone, specialty, coverNote, publicProfileUrl, firstName } = params;
  const titleLine = escHtml(jobTitle) + (loc ? ' &mdash; ' + escHtml(loc) : '');
  const credLine = credential ? ', ' + escHtml(credential) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>New applicant</title>
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
        NEW APPLICANT
      </span>
    </td>
  </tr>

  <!-- Role headline -->
  <tr>
    <td style="padding:16px 32px 4px;">
      <h1 style="margin:0;font-size:20px;font-weight:900;line-height:1.2;letter-spacing:-0.3px;">
        ${titleLine}
      </h1>
    </td>
  </tr>

  <!-- Candidate card -->
  <tr>
    <td style="padding:16px 32px 20px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;border:2px solid #000;background:#f9fafb;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:17px;font-weight:700;">${escHtml(candidateName)}${credLine}</p>
            <p style="margin:0 0 4px;font-size:14px;">
              <a href="mailto:${encodeURIComponent(email)}" style="color:#000;font-weight:600;">${escHtml(email)}</a>
              ${phone ? ' &middot; ' + escHtml(phone) : ''}
            </p>
            ${specialty ? `<p style="margin:0;font-size:13px;color:#6b7280;">Specialty: ${escHtml(specialty)}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${coverNote ? `
  <!-- Cover note -->
  <tr>
    <td style="padding:0 32px 20px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">From the candidate</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${escHtml(coverNote)}</p>
    </td>
  </tr>
  ` : ''}

  ${publicProfileUrl ? `
  <!-- Profile link -->
  <tr>
    <td style="padding:0 32px 20px;">
      <a href="${escHtml(publicProfileUrl)}"
         style="display:inline-block;border:2px solid #000;color:#000;padding:8px 16px;font-weight:700;font-size:13px;text-decoration:none;">
        View public profile &rarr;
      </a>
    </td>
  </tr>
  ` : ''}

  <!-- Reply instruction -->
  <tr>
    <td style="padding:0 32px 28px;border-top:0;">
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Reply to this email to contact ${escHtml(firstName)} directly. Their address is in Reply-To.
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:2px solid #000000;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        freejobpost.co is operated by Ava Health Partners LLC &middot; 4532 W Kennedy Blvd Ste 125, Tampa FL 33609
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildCandidateHtml(params: {
  firstName: string;
  jobTitle: string;
  loc: string;
  email: string;
  phone: string | null;
  // F93 (2026-06 audit): the old copy claimed "sent to the employer"
  // unconditionally, even when the employer send failed or no employer email
  // existed. Thread the real outcome in so the email never lies.
  employerDelivered: boolean;
}): string {
  const { firstName, jobTitle, loc, email, phone, employerDelivered } = params;
  const titleLine = escHtml(jobTitle) + (loc ? ' &middot; ' + escHtml(loc) : '');
  const contactLine = `<strong>${escHtml(email)}</strong>${phone ? ' or ' + escHtml(phone) : ''}`;
  const statusBody = employerDelivered
    ? `Hi ${escHtml(firstName)}. Your application went to the employer. They&apos;ll reach you directly at ${contactLine} if they want to move forward.`
    : `Hi ${escHtml(firstName)}. Your application is in and we&apos;re getting it to the employer. They&apos;ll reach you directly at ${contactLine} if they want to move forward.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Application submitted</title>
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
        APPLICATION SENT
      </span>
    </td>
  </tr>

  <!-- Headline -->
  <tr>
    <td style="padding:16px 32px 8px;">
      <h1 style="margin:0;font-size:22px;font-weight:900;line-height:1.2;letter-spacing:-0.3px;">
        ${titleLine}
      </h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:0 32px 24px;">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.5;">
        ${statusBody}
      </p>
    </td>
  </tr>

  <!-- What happens next -->
  <tr>
    <td style="padding:0 32px 28px;border-top:2px solid #000000;padding-top:20px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">What happens next</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.7;">
        <li>Most healthcare employers respond within a few days of reviewing applications.</li>
        <li>If you don&apos;t hear back within a week, you can safely apply to other roles.</li>
        <li>No account needed. Keep browsing at <a href="https://freejobpost.co/jobs" style="color:#000;font-weight:600;">freejobpost.co/jobs</a>.</li>
      </ul>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;border-top:2px solid #000000;">
      <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
        freejobpost.co is operated by Ava Health Partners LLC &middot; 4532 W Kennedy Blvd Ste 125, Tampa FL 33609
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // Service key (2026-06 audit): this fn used the ANON key, which forced
    // get_apply_notify_context_rpc + record_apply_notify_send to stay
    // anon-EXECUTABLE — meaning anyone with an application UUID could pull
    // candidate PII via PostgREST. Switching to the service key lets those
    // RPCs be revoked from anon/authenticated entirely (done in migration
    // lockdown_apply_notify_rpcs).
    const ANON_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const {
      application_id,
      cover_note,
      // candidate_id + job_id still accepted for backward compat with in-flight
      // server-action callers but no longer required — the RPC re-derives them
      // from application_id.
    } = await req.json() as {
      application_id?: string;
      candidate_id?: string;
      job_id?: string;
      cover_note?: string;
    };

    if (!application_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing application_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, ANON_KEY);

    // Re-derive recipients server-side via SECURITY DEFINER RPC -- can't trust
    // the client AND direct anon SELECTs against public_candidates /
    // public_employers are blocked by RLS (only is_public candidates are
    // anon-readable; public_employers has no anon policy at all). The RPC
    // bypasses RLS in a controlled way and returns just what we need.
    const { data: ctxData, error: ctxErr } = await sb.rpc('get_apply_notify_context_rpc', {
      p_application_id: application_id,
    });
    if (ctxErr) {
      console.error("get_apply_notify_context_rpc error:", ctxErr.message);
      return new Response(JSON.stringify({ success: false, error: "Notification context unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ctx = ctxData as {
      success: boolean;
      error?: string;
      code: number;
      job?: { id: string; slug: string; title: string; city: string | null; state: string | null };
      candidate?: {
        id: string; slug: string;
        first_name: string; last_name: string;
        email: string; phone: string | null;
        credential: string | null; specialty: string | null;
        is_public: boolean;
      };
      employer_email?: string | null;
      cover_note?: string | null;
    };
    if (!ctx.success || !ctx.job || !ctx.candidate) {
      return new Response(JSON.stringify({ success: false, error: ctx.error || "Context not found" }), {
        status: ctx.code || 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const job = ctx.job;
    const candidate = ctx.candidate;
    const employerEmail = ctx.employer_email ?? null;
    // Caller may pass a fresher cover_note; fall back to the stored copy
    const effectiveCoverNote = cover_note ?? ctx.cover_note ?? null;

    // Build a "City, ST" location string. Two defensive guards:
    //   1. Skip the suffix entirely if the title already contains the word
    //      "Remote" (or city/state) -- avoids duplicating "Remote" in the
    //      common case of remote jobs whose title says "-- Remote Job".
    //   2. Drop tokens whose value is literally "Remote" (the seed data has
    //      state="Remote" on remote roles, which is non-standard but real).
    const locTokens = [job.city, job.state]
      .filter((t): t is string => !!t && t !== 'Remote');
    const rawLoc = locTokens.join(', ');
    const titleAlreadyHasLoc = rawLoc.length > 0
      && job.title.toLowerCase().includes(rawLoc.toLowerCase());
    const loc = titleAlreadyHasLoc ? '' : rawLoc;
    const candidateName = `${candidate.first_name} ${candidate.last_name}`;

    if (!Deno.env.get("RESEND_API_KEY")) {
      console.error("apply-notify: RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ success: true, emails_sent: 0, note: "email_not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sentResults: Array<{ to: string; ok: boolean }> = [];

    // === 1. Employer notification ==========================================
    if (employerEmail) {
      const publicProfileUrl = candidate.is_public
        ? `https://www.freeresumepost.co/profile/${candidate.slug}`
        : null;

      const empSubject = `New applicant: ${candidateName} for ${job.title}`;
      const empHtml = buildEmployerHtml({
        jobTitle: job.title,
        loc,
        candidateName,
        credential: candidate.credential,
        email: candidate.email,
        phone: candidate.phone,
        specialty: candidate.specialty,
        coverNote: effectiveCoverNote,
        publicProfileUrl,
        firstName: candidate.first_name,
      });
      const empText = `New applicant for ${job.title}${loc ? ' -- ' + loc : ''}

${candidateName}${candidate.credential ? ', ' + candidate.credential : ''}
${candidate.email}${candidate.phone ? ' / ' + candidate.phone : ''}${candidate.specialty ? '\nSpecialty: ' + candidate.specialty : ''}
${effectiveCoverNote ? '\nFrom the candidate:\n' + effectiveCoverNote + '\n' : ''}
${publicProfileUrl ? '\nPublic profile: ' + publicProfileUrl + '\n' : ''}
Reply to this email to contact ${candidate.first_name} directly.

freejobpost.co -- operated by Ava Health Partners LLC`;

      const empSendResult = await safeSend({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: employerEmail,
        replyTo: candidate.email,
        subject: empSubject,
        html: empHtml,
        text: empText,
      });
      sentResults.push({ to: employerEmail, ok: empSendResult.ok });
      if (!empSendResult.ok) console.error("employer notify failed:", empSendResult.status, empSendResult.error.slice(0, 200));

      // #15: durable audit record for the employer notify (success OR failure)
      // via a DEFINER RPC into the RLS-locked email_sends. Lets a failed
      // employer notify be detected + manually re-sent. Best-effort.
      try {
        await sb.rpc("record_apply_notify_send", {
          p_application_id: application_id,
          p_to_email: employerEmail,
          p_from_email: FROM_EMAIL,
          p_from_name: FROM_NAME,
          p_subject: empSubject,
          p_status: empSendResult.ok ? "sent" : "failed",
          p_error: empSendResult.ok ? null : (empSendResult.error ?? null),
          p_resend_id: empSendResult.ok ? (empSendResult.messageId ?? null) : null,
          p_candidate_id: candidate.id,
        });
      } catch (recErr) {
        console.error("record_apply_notify_send failed:", recErr instanceof Error ? recErr.message : "unknown");
      }
    }

    // === 2. Candidate confirmation =========================================
    // F93: only claim delivery when the employer notification actually sent.
    const employerDelivered = !!employerEmail && sentResults.some((r) => r.to === employerEmail && r.ok);
    const candSubject = `Your application to ${job.title} is in`;
    const candHtml = buildCandidateHtml({
      firstName: candidate.first_name,
      jobTitle: job.title,
      loc,
      email: candidate.email,
      phone: candidate.phone,
      employerDelivered,
    });
    const candText = `Hi ${candidate.first_name},

${employerDelivered
  ? `Your application to ${job.title}${loc ? ' -- ' + loc : ''} went to the employer.`
  : `Your application to ${job.title}${loc ? ' -- ' + loc : ''} is in and we're getting it to the employer.`}

They'll reach you directly at ${candidate.email}${candidate.phone ? ' or ' + candidate.phone : ''} if they want to move forward.

What happens next:
- Most healthcare employers respond within a few days.
- If you don't hear back within a week, you can safely apply to other roles.
- Keep browsing at https://freejobpost.co/jobs

freejobpost.co -- operated by Ava Health Partners LLC`;

    // Candidate confirmation keeps the freeresumepost display name since
    // candidates uploaded their resume there; the address must live on
    // avahealth.co (the only Resend-verified domain in this workspace).
    const candFromName = "Free Resume Post";
    const candFromEmail = "resumes@avahealth.co";
    const candSendResult = await safeSend({
      from: `${candFromName} <${candFromEmail}>`,
      to: candidate.email,
      replyTo: "alex@avahealth.co",
      subject: candSubject,
      html: candHtml,
      text: candText,
    });
    sentResults.push({ to: candidate.email, ok: candSendResult.ok });
    if (!candSendResult.ok) console.error("candidate notify failed:", candSendResult.status, candSendResult.error.slice(0, 200));

    return new Response(JSON.stringify({
      success: true,
      application_id,
      emails_sent: sentResults.filter((r) => r.ok).length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("apply-notify error:", err instanceof Error ? err.message : 'unknown');
    return new Response(JSON.stringify({ success: false, error: "Notification failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
