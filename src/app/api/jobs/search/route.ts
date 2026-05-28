// Server-side filtered + paginated job search.
//
// WHY THIS EXISTS (2026-05-28 cost/perf pass): /jobs used to ship the entire
// active corpus (~12K jobs, ~5.5MB / 803KB gzip) to the browser so that
// jobs-filter.tsx could filter in memory. Only 50 cards ever render at once,
// so 99% of that payload was pure egress + parse waste on every visit.
//
// New model: /jobs stays an ISR-static page that server-renders the first 50
// jobs (good for SEO + instant first paint, and — critically — keeps the page
// CACHEABLE so crawler traffic does NOT spawn a Lambda per hit). This route
// handles every subsequent filter / "show more", and is therefore only hit on
// real human interaction (bots don't operate the filter UI), so it adds
// negligible invocation cost while removing the giant payload.
//
// public_jobs is ~14K active rows and well-indexed (status+created_at,
// state+role, specialty, specialty_trgm, employer), so these filtered/paged
// queries return in single-digit ms — this is NOT the 1.4M-row providers
// directory that saturated the shared DB; no MV needed here.

import { type NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { JOB_LIST_FIELDS, type PublicJob } from '@/lib/public-jobs'

// Per-filter, human-triggered — never statically cached.
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const VALID_REMOTE = new Set(['remote', 'hybrid', 'onsite'])
const VALID_TYPE = new Set([
  'full_time',
  'part_time',
  'contract',
  'locum',
  'per_diem',
  'internship',
])

// Strip characters that break PostgREST's .or() filter grammar (commas split
// OR terms; parens group; * is the ilike wildcard; %/\ are escape-sensitive)
// and cap length. The on-site search box is a convenience filter, not a query
// language — exact punctuation handling isn't required, but NOT sanitizing
// would let a stray comma silently truncate the OR group or 500 the request.
function sanitizeQ(raw: string): string {
  return raw
    .replace(/[,()*\\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams
  const q = sanitizeQ(sp.get('q') ?? '')
  const role = (sp.get('role') ?? '').trim()
  const state = (sp.get('state') ?? '').trim()
  const remote = (sp.get('remote') ?? '').trim()
  const type = (sp.get('type') ?? '').trim()
  const verifiedOnly = sp.get('verified') === '1'
  const page = Math.max(0, Math.min(500, Number.parseInt(sp.get('page') ?? '0', 10) || 0))

  const nowIso = new Date().toISOString()

  let query = supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS, { count: 'exact' })
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)

  if (role) query = query.eq('role', role)
  if (state) query = query.eq('state', state)
  if (remote && VALID_REMOTE.has(remote)) query = query.eq('remote_hybrid', remote)
  if (type && VALID_TYPE.has(type)) query = query.eq('employment_type', type)
  if (q) {
    // ilike across the same fields the old in-memory filter searched.
    query = query.or(
      [
        `title.ilike.*${q}*`,
        `role.ilike.*${q}*`,
        `city.ilike.*${q}*`,
        `state.ilike.*${q}*`,
        `specialty.ilike.*${q}*`,
      ].join(','),
    )
  }

  if (verifiedOnly) {
    // Resolve the verified employer set server-side — same definition as the
    // /jobs page (verified_at set, excluding seeded + ATS imports + Ava seed
    // names) so the server filter and the client's per-card ✓ stay consistent.
    const { data: emps } = await supabase
      .from('public_employers_directory')
      .select('id')
      .not('verified_at', 'is', null)
      .not('verified_via', 'in', '(seeded,ats_import)')
      .not('company_name', 'ilike', 'Ava Health%')
    const ids = ((emps ?? []) as Array<{ id: string }>).map((e) => e.id)
    if (ids.length === 0) {
      return NextResponse.json({ jobs: [], total: 0 })
    }
    query = query.in('employer_id', ids)
  }

  // Match the /jobs server order (updated_at DESC bubbles re-touched ATS rows
  // to the top each ingest tick; keeps the listing lively without a big
  // single-source ingest monopolising the front page).
  query = query
    .order('updated_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json(
      { jobs: [], total: 0, error: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { jobs: (data ?? []) as PublicJob[], total: count ?? 0 },
    // Tiny private cache so a user toggling the same filter twice in quick
    // succession doesn't re-hit the DB, without serving stale results across
    // users. Filter combos vary, so this rarely even applies — it's just hygiene.
    { headers: { 'Cache-Control': 'private, max-age=15' } },
  )
}
