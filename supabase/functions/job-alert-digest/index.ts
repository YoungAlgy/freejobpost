// job-alert-digest — staggered weekly job-alert emails for freejobpost.co
// subscribers (public_job_alert_subscribers, captured by the JobAlertCapture
// widget). This is the FULFILLMENT side of the board→CRM lead capture: each
// subscriber gets new matching jobs (by specialty / state / city) on a rolling
// 7-day cadence.
//
// WHY AN EDGE FUNCTION (not a Vercel route): the digester needs service-role DB
// access to read the RLS-locked subscriber table. Keeping that key INSIDE
// Supabase (never in the public board's env) is the secure pattern — mirrors
// apply-notify / weekly-digest.
//
// CHANNEL — Resend (researched 2026-06: free 3,000/mo, 100/day SHARED with the
// boards' transactional mail; no contact cap; already wired). We send
// STAGGERED: each run only processes subscribers whose last digest was ≥7 days
// ago, capped at JOB_ALERT_DAILY_CAP/run (default 80) to leave headroom under
// the 100/day cap. Per-subscriber weekly cadence spreads sends naturally. If we
// outgrow Resend free, the ONLY change is the fetch() call below → Brevo
// (300/day, 100k contacts, also free). Mailchimp was rejected (250 contacts /
// 500 sends free as of Jan 2026).
//   Scaling note: with the 80/run cap, the weekly cadence holds up to ~560
//   active subscribers (80 × 7). Past that, raise the cap (if Resend headroom)
//   or switch the send call to Brevo.
//
// AUTH — cron-only via X-Cron-Token === DRIP_SCHEDULER_TOKEN (same as the other
// cron fns). Deploy with verify_jwt=false.
//
// DEPLOY + SCHEDULE (on "ship", in this order):
//   1. Deploy this function (verify_jwt=false).
//   2. Schedule the daily cron (it processes whoever is due that day):
//        select cron.schedule(
//          'job-alert-digest-daily', '0 13 * * *',
//          $$
//            select net.http_post(
//              url := 'https://tsruqbodyrmxqzhvxret.supabase.co/functions/v1/job-alert-digest',
//              headers := jsonb_build_object(
//                'Content-Type', 'application/json',
//                'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'drip_scheduler_token' limit 1)
//              ),
//              body := '{}'::jsonb,
//              timeout_milliseconds := 60000
//            );
//          $$
//        );

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-drip-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FROM_NAME = "Free Job Post";
const FROM_EMAIL = "jobs@avahealth.co"; // product address (2026-06 audit F95: was alex@ personal)
const FEEDBACK_EMAIL = "alex@avahealth.co"; // replies + feedback still reach a human
const SITE = "https://freejobpost.co";
const ADDRESS = "Ava Health Partners · 4532 W Kennedy Blvd Suite 125, Tampa FL 33609";

const DAILY_CAP = parseInt(Deno.env.get("JOB_ALERT_DAILY_CAP") || "80", 10);
const MAX_JOBS_PER_EMAIL = 8;
const FIRST_RUN_LOOKBACK_DAYS = 14;

interface Subscriber {
  id: string;
  email: string;
  specialty: string | null;
  state: string | null;
  city: string | null;
  unsubscribe_token: string;
  last_alert_sent_at: string | null;
}
interface Job {
  slug: string;
  title: string;
  city: string | null;
  state: string | null;
  salary_min: number | null;
  salary_max: number | null;
}

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtSalary(min: number | null, max: number | null): string {
  const k = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  if (min && max) return `${k(min)}–${k(max)}`;
  if (min) return `${k(min)}+`;
  if (max) return `up to ${k(max)}`;
  return "";
}

function whatLine(sub: Subscriber, count?: number): string {
  const loc = sub.city ? ` in ${sub.city}` : sub.state ? ` in ${sub.state}` : "";
  const spec = sub.specialty ? sub.specialty : "healthcare";
  // Count-aware noun: "1 … job" vs "N … jobs". Omit `count` for the generic
  // subscription label in the footer (always plural).
  const noun = count === 1 ? "job" : "jobs";
  return `${spec} ${noun}${loc}`;
}

function renderEmail(sub: Subscriber, jobs: Job[]): { subject: string; html: string; text: string; unsubUrl: string } {
  const whatN = whatLine(sub, jobs.length); // count-aware ("1 … job" / "8 … jobs")
  const whatGeneric = whatLine(sub);        // always plural — subscription/footer label
  const subject = `${jobs.length} new ${whatN}`;
  const unsubUrl = `${SITE}/unsubscribe?token=${sub.unsubscribe_token}`;

  const rows = jobs.map((j) => {
    const loc = [j.city, j.state].filter(Boolean).join(", ");
    const sal = fmtSalary(j.salary_min, j.salary_max);
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e5e5e5">
        <a href="${SITE}/jobs/${esc(j.slug)}" style="font-weight:700;color:#111;text-decoration:none;font-size:16px">${esc(j.title)}</a>
        <div style="color:#555;font-size:13px;margin-top:3px">${esc(loc)}${sal ? ` · <strong>${sal}</strong>` : ""}</div>
      </td></tr>`;
  }).join("");

  const text = `New ${whatN} on freejobpost.co:\n\n` +
    jobs.map((j) => `• ${j.title} — ${[j.city, j.state].filter(Boolean).join(", ")} — ${SITE}/jobs/${j.slug}`).join("\n") +
    `\n\nBrowse all: ${SITE}/jobs` +
    `\n\nNot seeing the right roles? Reply to this email and tell us what you're after — a real person reads every one.` +
    `\n\nUnsubscribe: ${unsubUrl}\n\n${ADDRESS}`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#fff;border:2px solid #111;max-width:600px">
    <tr><td style="padding:28px 28px 0">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#15803d">freejobpost.co job alert</p>
      <h1 style="margin:8px 0 4px;font-size:24px;font-weight:900;color:#111;letter-spacing:-0.5px">${jobs.length} new ${esc(whatN)}</h1>
      <p style="margin:0 0 8px;color:#555;font-size:14px">Fresh matches since your last alert. Free to apply, no account needed.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
      <p style="margin:24px 0 0"><a href="${SITE}/jobs" style="display:inline-block;background:#111;color:#fff;font-weight:700;text-decoration:none;padding:12px 22px">Browse all jobs →</a></p>
      <!-- Feedback CTA — routes replies to the monitored alex@avahealth.co inbox; this is the "feedback drives updates" loop. Copy is Algy/Ally brand-voice tweakable. -->
      <p style="margin:18px 0 0;color:#555;font-size:13px;line-height:1.6">Not seeing the right roles? <a href="mailto:${FEEDBACK_EMAIL}?subject=Job%20alert%20feedback" style="color:#15803d;font-weight:700;text-decoration:none">Reply and tell us what you&rsquo;re after</a> — a real person reads every one.</p>
    </td></tr>
    <tr><td style="padding:24px 28px;border-top:1px solid #e5e5e5">
      <p style="margin:0;color:#999;font-size:12px;line-height:1.6">You&rsquo;re getting this because you subscribed to ${esc(whatGeneric)} alerts on freejobpost.co. <a href="${unsubUrl}" style="color:#666">Unsubscribe</a>.<br/>${esc(ADDRESS)}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, html, text,
              reply_to: FEEDBACK_EMAIL, unsubUrl };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Same X-Cron-Token / X-Drip-Token auth as the other cron fns.
    const expected = Deno.env.get("DRIP_SCHEDULER_TOKEN");
    const given = req.headers.get("x-cron-token") || req.headers.get("x-drip-token");
    if (!expected || given !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const sb = createClient(SUPABASE_URL, SVC);

    const now = new Date();
    const nowIso = now.toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const firstRunSince = new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86400_000).toISOString();

    // Due subscribers — never-sent or last sent ≥7 days ago, oldest first, capped.
    const { data: subs, error: subErr } = await sb
      .from("public_job_alert_subscribers")
      .select("id, email, specialty, state, city, unsubscribe_token, last_alert_sent_at")
      .is("unsubscribed_at", null)
      .or(`last_alert_sent_at.is.null,last_alert_sent_at.lt.${sevenDaysAgo}`)
      .order("last_alert_sent_at", { ascending: true, nullsFirst: true })
      .limit(DAILY_CAP);
    if (subErr) throw new Error(`subscribers query: ${subErr.message}`);

    let processed = 0, sent = 0, skipped_no_match = 0, skipped_claimed = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const sub of (subs ?? []) as Subscriber[]) {
      processed++;

      // #10 fix (claim-then-send): atomically advance the cursor BEFORE any work,
      // gated on the row still being due. A concurrent run (a manual call overlapping
      // the daily cron, or a cron retry) that loses the race updates 0 rows -> we skip
      // it -> no double digest. Replaces the old advance-cursor-AFTER-send, which let
      // two runs both see the subscriber as due and both send.
      // Trade: a send that fails after this claim won't retry until next week — fine
      // for a teaser digest (the old code also advanced the cursor regardless of send).
      const claim = await sb.from("public_job_alert_subscribers")
        .update({ last_alert_sent_at: nowIso })
        .eq("id", sub.id)
        .or(`last_alert_sent_at.is.null,last_alert_sent_at.lt.${sevenDaysAgo}`)
        .select("id");
      if (claim.error) {
        errors.push({ email: sub.email, error: `claim: ${claim.error.message}` });
        continue;
      }
      if (!claim.data || claim.data.length === 0) {
        skipped_claimed++; // another concurrent run already claimed this subscriber
        continue;
      }

      const since = sub.last_alert_sent_at ?? firstRunSince;
      try {
        let q = sb.from("public_jobs")
          .select("slug, title, city, state, salary_min, salary_max")
          .eq("status", "active")
          .is("deleted_at", null)
          .gt("expires_at", nowIso)
          .gt("created_at", since)
          .order("created_at", { ascending: false })
          .limit(MAX_JOBS_PER_EMAIL);
        if (sub.state) q = q.eq("state", sub.state);
        if (sub.specialty) {
          const p = `%${sub.specialty}%`;
          q = q.or(`title.ilike.${p},specialty.ilike.${p},role.ilike.${p}`);
        }
        if (sub.city) q = q.ilike("city", `%${sub.city}%`);

        const { data: jobs, error: jErr } = await q;
        if (jErr) throw new Error(jErr.message);

        const list = (jobs ?? []) as Job[];
        if (list.length > 0) {
          const { subject, html, text,
              reply_to: FEEDBACK_EMAIL, unsubUrl } = renderEmail(sub, list);
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${FROM_NAME} <${FROM_EMAIL}>`,
              to: [sub.email],
              subject, html, text,
              reply_to: FEEDBACK_EMAIL,
              // RFC 2369 List-Unsubscribe header — Gmail/Yahoo bulk-sender best
              // practice; materially improves inbox placement for recurring alert
              // mail. Targets the /unsubscribe confirm page (GET). One-click (RFC
              // 8058 List-Unsubscribe-Post) is omitted: it would POST to this URL,
              // but /unsubscribe is a prefetch-safe GET confirm page. Add a POST
              // handler + the One-Click header if daily volume nears Gmail's 5k
              // one-click threshold.
              headers: { "List-Unsubscribe": `<${unsubUrl}>` },
              tags: [{ name: "kind", value: "job_alert" }],
            }),
          });
          const rdata = await resp.json();
          if (resp.ok && rdata.id) {
            sent++;
            // Audit row (best-effort), mirrors weekly-digest. Lets resend-webhook
            // reconcile opens/bounces. candidate_type CHECK allows 'unknown'.
            const ins = await sb.from("email_sends").insert({
              campaign_id: null, user_id: null, candidate_id: null,
              candidate_type: "unknown",
              to_email: sub.email, from_email: FROM_EMAIL, from_name: FROM_NAME,
              subject, body_preview: "[job_alert] " + text.slice(0, 160),
              resend_id: rdata.id, status: "sent", sent_at: new Date().toISOString(),
            });
            if (ins.error) console.error("email_sends insert:", ins.error.message);
          } else {
            errors.push({ email: sub.email, error: JSON.stringify(rdata).slice(0, 200) });
          }
        } else {
          skipped_no_match++;
        }

        // Cursor was already advanced atomically by the claim at the top of this
        // iteration (claim-then-send, #10) — keeps the per-subscriber weekly cadence
        // and moves the next run's window forward even on a quiet (no-match) week.
      } catch (err) {
        errors.push({ email: sub.email, error: err instanceof Error ? err.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, sent, skipped_no_match, skipped_claimed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === "string" ? err : JSON.stringify(err));
    console.error("job-alert-digest error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
