// POST /api/revalidate-expired — on-demand ISR revalidation for job pages
// whose status flipped to expired (or whose expires_at just lapsed), plus the
// sitemap. Why: job pages revalidate every 24h for cost reasons, so a freshly
// closed job kept serving its ACTIVE render — with live JobPosting JSON-LD —
// for up to a day+ (live-verified 57.8h stale during the 2026-06 audit, F61).
// Google for Jobs policy requires removing JobPosting markup promptly when a
// position closes. This route surgically revalidates just the flipped slugs
// instead of dropping the global revalidate window (which would re-create the
// 2026-05-28 ISR cost storm).
//
// Trigger: pg_cron (jobname freejob-revalidate-expired) every 4h, offset
// after the ingest crons. pg_cron always attaches the shared
// 'drip_scheduler_token' vault secret as the X-Cron-Token header, whether or
// not CRON_SECRET is configured below -- so both auth modes ultimately check
// the same secret:
//   - If CRON_SECRET is set in Vercel env: X-Cron-Token must match it here,
//     up front, before any DB call.
//   - Else: the X-Cron-Token header is forwarded as p_token to
//     claim_cron_run, which independently verifies it against that same
//     vault secret before ever touching the lock table (2026-08-20
//     hardening -- previously this RPC checked only job-name shape and the
//     30-min interval, so anyone holding the public anon key could call
//     /rest/v1/rpc/claim_cron_run directly and grief the lock, making this
//     route's own legitimate claim silently no-op). A caller with a missing
//     or wrong token gets the same "false" a rate-limited caller gets --
//     this route never distinguishes auth failure from "ran recently" in its
//     response, so it can't be used as an oracle. One side effect: a manual
//     GET/POST with no X-Cron-Token header (e.g. hitting the URL directly in
//     a browser while CRON_SECRET is unset) is now always a no-op skip.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { SITEMAP_CHILDREN } from '@/lib/sitemap-chunks'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const token = req.headers.get('x-cron-token')
    if (token !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  if (!secret) {
    const { data: claimed, error: claimErr } = await sb.rpc('claim_cron_run', {
      p_job: 'freejob_revalidate_expired',
      p_min_minutes: 30,
      p_token: req.headers.get('x-cron-token'),
    })
    if (claimErr) {
      console.error('claim_cron_run error:', claimErr.message)
      return NextResponse.json({ ok: false, error: 'claim failed' }, { status: 500 })
    }
    if (!claimed) {
      return NextResponse.json({ ok: true, skipped: 'ran recently' })
    }
  }

  // Two flip populations in the last 26h (cron period 4h + slack):
  //  - sweep/manual flips: status in ('expired','filled') with a fresh updated_at
  //    ('filled' added 2026-08-20 -- the employer dashboard's "Mark filled"
  //    button is the only status-change action actually wired up on
  //    /employer, and it produces this status, not 'expired'. archiveJob()
  //    now revalidates the job's own page immediately on click, but this
  //    cron sweep is the backstop for any flip that happens outside that
  //    one code path -- same reasoning as the 'expired' backstop below.)
  //  - natural lapses: still status='active' but expires_at just passed
  const sinceIso = new Date(Date.now() - 26 * 3600_000).toISOString()
  const nowIso = new Date().toISOString()
  const [flipped, lapsed] = await Promise.all([
    sb
      .from('public_jobs')
      .select('slug')
      .in('status', ['expired', 'filled'])
      .is('deleted_at', null)
      .gt('updated_at', sinceIso)
      .limit(600),
    sb
      .from('public_jobs')
      .select('slug')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', sinceIso)
      .lt('expires_at', nowIso)
      .limit(300),
  ])
  // Query failures here must NOT block the sitemap/homepage revalidation
  // below (see 2026-08-06 incident: the `flipped` query alone was timing out
  // -- Postgres 57014, "canceling statement due to statement timeout", almost
  // certainly a missing index on public_jobs(status, updated_at) now that the
  // table has grown past 74k rows -- which silently zeroed out EVERY run of
  // this route for an unknown period, meaning the original Google-for-Jobs
  // compliance fix this route exists for (stale JobPosting markup on expired
  // jobs) had likely regressed back to the pre-fix stale-for-24h+ behavior.
  // A slow/broken query here is a real, separate bug to fix at the DB level
  // (needs Algy to apply the index -- Supabase migrations are stale, live DB
  // is truth); it should degrade this route, not take the whole thing down.
  const queryError = flipped.error || lapsed.error
  const slugs = new Set<string>()
  if (queryError) {
    console.error('revalidate-expired query error:', queryError.message)
  } else {
    for (const r of flipped.data ?? []) if (r.slug) slugs.add(r.slug)
    for (const r of lapsed.data ?? []) if (r.slug) slugs.add(r.slug)
    for (const s of slugs) revalidatePath(`/jobs/${s}`)
  }

  // The sitemap's hourly self-revalidation silently froze for days (F60) —
  // this is the independent backstop that forces a fresh copy each cron pass.
  //
  // 2026-08-19: the sitemap is now an index + 21 children (see
  // src/lib/sitemap-chunks.ts). Revalidating only /sitemap.xml would refresh the
  // index while leaving every actual URL list frozen — the exact F60 failure this
  // backstop exists to prevent, except silent, because the index would keep
  // looking healthy. Every child is refreshed explicitly. They all read the same
  // unstable_cache'd fetch, so this is one DB scan, not 21.
  revalidatePath('/sitemap.xml')
  for (const child of SITEMAP_CHILDREN) revalidatePath(`/sitemaps/${child}`)

  // Homepage FAIL CLOSED fix (2026-08-06, src/app/page.tsx) throws instead of
  // caching a false-empty render on a DB hiccup, which is correct — but it
  // means a render that failed mid-outage leaves the *previous* (possibly
  // also-bad, or just stale) ISR cache in place for the full 6h `revalidate`
  // window, since OpenNext's R2/D1 incremental cache isn't cleared by a
  // redeploy. Piggybacking the homepage on this same 4h cron closes that gap
  // instead of waiting up to 6h for the next passive revalidation.
  revalidatePath('/')

  return NextResponse.json({
    ok: !queryError,
    error: queryError ? 'flipped/lapsed query failed, see logs' : undefined,
    revalidated: slugs.size,
    sitemap: true,
    homepage: true,
  })
}

export async function POST(req: Request) {
  return handle(req)
}

// GET kept for manual checks (same lock applies).
export async function GET(req: Request) {
  return handle(req)
}
