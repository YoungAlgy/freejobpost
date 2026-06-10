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
// after the ingest crons. Auth, dual-mode:
//   - If CRON_SECRET is set in Vercel env: X-Cron-Token must match (the cron
//     already sends the shared vault token, so setting CRON_SECRET to that
//     value hardens this with zero cron changes).
//   - Else: DB-side claim lock (claim_cron_run, 30-min min interval) bounds
//     any abuse to one cheap pass per half hour. The work itself is harmless
//     (revalidating public pages) — the lock is about cost, not safety.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

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
  //  - sweep/manual flips: status='expired' with a fresh updated_at
  //  - natural lapses: still status='active' but expires_at just passed
  const sinceIso = new Date(Date.now() - 26 * 3600_000).toISOString()
  const nowIso = new Date().toISOString()
  const [flipped, lapsed] = await Promise.all([
    sb
      .from('public_jobs')
      .select('slug')
      .eq('status', 'expired')
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
  if (flipped.error || lapsed.error) {
    console.error(
      'revalidate-expired query error:',
      flipped.error?.message || lapsed.error?.message,
    )
    return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  }

  const slugs = new Set<string>()
  for (const r of flipped.data ?? []) if (r.slug) slugs.add(r.slug)
  for (const r of lapsed.data ?? []) if (r.slug) slugs.add(r.slug)
  for (const s of slugs) revalidatePath(`/jobs/${s}`)

  // The sitemap's hourly self-revalidation silently froze for days (F60) —
  // this is the independent backstop that forces a fresh copy each cron pass.
  revalidatePath('/sitemap.xml')

  return NextResponse.json({ ok: true, revalidated: slugs.size, sitemap: true })
}

export async function POST(req: Request) {
  return handle(req)
}

// GET kept for manual checks (same lock applies).
export async function GET(req: Request) {
  return handle(req)
}
