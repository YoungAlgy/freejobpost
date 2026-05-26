// /click/[slug] — per-partner apply-click redirect endpoint.
//
// For real human traffic: logs one row in apply_clicks (via the log_apply_click
// SECURITY DEFINER RPC) then 302-redirects to the job's canonical apply_url.
// This is what makes "Apply-click logging (per-job, per-partner)" real —
// partners send users here with ?p=<partner-key>, and we keep verifiable
// attribution data.
//
// For bot traffic (matched by src/lib/bot-filter.ts): the redirect still
// happens (crawlers walking /click/ paths is normal and desired) but the
// apply_clicks insert is skipped so partner-attribution dashboards aren't
// inflated. See bot-filter.ts for the audit that motivated this.
//
// Cache: force-dynamic. The endpoint MUST log per request; caching would
// kill attribution. The route does at most:
//   1) 1 select on public_jobs (by slug, indexed)
//   2) 1 RPC call writing one row + counter bump (skipped for bots)
//   3) 1 SHA-256 hash of the client IP
// Total wall time ~30-80ms — fine to run inline.

import { type NextRequest, NextResponse } from 'next/server'
import { looksLikeBot } from '@/lib/bot-filter'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// Don't statically generate this; every hit must run the handler.
export const revalidate = 0

// Workday + some Greenhouse external IDs are uppercase alphanumeric, so
// many slugs in production end with e.g. "...-wd-R2654676". Lowercase-only
// would 404 ~3,400 active jobs. See src/app/jobs/[slug]/page.tsx.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,128}$/

// Truncated SHA-256 of the client IP. We keep only the first 8 hex chars
// (32 bits of entropy) — enough to dedupe burst-click noise without making
// the row personally identifiable.
async function hashIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null
  try {
    const buf = new TextEncoder().encode(ip)
    const hash = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(hash))
      .slice(0, 4)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

function safeApplyUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    // Reject anything that's not http(s) — javascript:, data:, etc. would
    // open-redirect through us. Belt-and-suspenders since apply_url is
    // employer-controlled in some sources.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  // Belt-and-suspenders slug validation — DB lookup will return nothing for
  // bad slugs anyway, but reject obviously-malformed input fast.
  if (!SLUG_RE.test(slug)) {
    return NextResponse.redirect(new URL('/jobs', req.url))
  }

  const partnerRaw = req.nextUrl.searchParams.get('p') ?? 'internal'
  // log_apply_click() normalizes + length-caps server-side; cap here too
  // so the URL doesn't carry pathological values into the DB.
  const partner = partnerRaw.toLowerCase().trim().slice(0, 64) || 'internal'

  // Resolve the canonical apply URL. Active jobs only — expired/deleted
  // jobs fall through to the listing page so a stale referrer doesn't
  // dead-end the user.
  const { data: job } = await supabase
    .from('public_jobs')
    .select('apply_url')
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  const applyUrl = safeApplyUrl(job?.apply_url)

  // Best-effort log: if the RPC fails, still redirect — attribution is
  // a nice-to-have, but breaking the user's apply flow because of a DB
  // hiccup would be worse.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? null
  const userAgent = req.headers.get('user-agent') || null
  const referrer = req.headers.get('referer') || null
  const ipHash = await hashIp(ip)

  // Skip apply_clicks insert for bot traffic — see src/lib/bot-filter.ts.
  // Redirect still happens below so crawlers walking /click/ paths don't
  // hit a dead end.
  if (!looksLikeBot(userAgent)) {
    try {
      await supabase.rpc('log_apply_click', {
        p_slug: slug,
        p_partner: partner,
        p_user_agent: userAgent?.slice(0, 500) ?? null,
        p_ip_hash: ipHash,
        p_referrer: referrer?.slice(0, 500) ?? null,
      })
    } catch {
      // Swallow — log_apply_click is best-effort.
    }
  }

  // No applyURL on file → bounce back to the job detail page where the
  // candidate can see the description and find a contact path. Better than
  // a hard error and better than redirecting to the homepage.
  if (!applyUrl) {
    return NextResponse.redirect(new URL(`/jobs/${slug}`, req.url), {
      status: 302,
    })
  }

  return NextResponse.redirect(applyUrl, { status: 302 })
}
