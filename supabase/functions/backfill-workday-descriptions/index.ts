// backfill-workday-descriptions edge function
// =============================================================================
// One-shot rate-limited backfill for Workday jobs whose description was
// captured from the listing endpoint (≤150-char preview) instead of the
// full job-detail endpoint. Iterates jobs in batches, fetches the
// jobPostingInfo.jobDescription, and UPDATEs public_jobs in place.
//
// Background: refresh-ats-imports v9 dropped the per-item Workday detail-
// fetch to stay under the 150s edge cap. v10 re-introduced it but ONLY for
// new jobs (capped at 100/board/run via the existingRefs set). That left
// ~1,258 already-imported Workday jobs stuck with 150-char description
// previews — bad for UX and bad for the public_jobs SEO surface.
//
// This function is invoked manually (HTTP POST) and works through the
// backlog 50 jobs at a time. Re-run until it returns processed=0.
//
// Idempotent: only updates rows whose current description is shorter than
// `MIN_GOOD_LENGTH` chars (default 300) — re-running is a no-op once a
// row has been hydrated with the full description.
//
// Input body (all optional):
//   { limit?: number,      // jobs per invocation, default 50, max 200
//     board?: string,      // restrict to one source tag, e.g.
//                          // 'workday:ccf/ClevelandClinicCareers'
//     min_length?: number, // re-hydrate threshold, default 300
//     dry_run?: boolean }  // skip the UPDATE, just report what would change
//
// Auth: verify_jwt=true (default). Service-role / authenticated callers
// only. Function only reads + writes public_jobs.description, no other
// surface affected.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const WORKDAY_UA = 'freejobpost.co/aggregator (alex@avahealth.co)'

// Hard-coded mapping of source-tag → (tenantHost, tenant, site). Mirrors
// the Workday entries in refresh-ats-imports SEED_BOARDS — keep in sync.
// We derive these here instead of parsing apply_url because the apply_url
// shape is `https://${tenantHost}/${site}${externalPath}` and externalPath
// itself starts with /, so naive parsing is brittle. Explicit lookup is
// 6 lines and unambiguous.
const WORKDAY_TENANTS: Record<string, { tenantHost: string; tenant: string; site: string }> = {
  'workday:ccf/ClevelandClinicCareers': {
    tenantHost: 'ccf.wd1.myworkdayjobs.com',
    tenant: 'ccf',
    site: 'ClevelandClinicCareers',
  },
  'workday:adventhealth/AH_External_Career_Site': {
    tenantHost: 'adventhealth.wd12.myworkdayjobs.com',
    tenant: 'adventhealth',
    site: 'AH_External_Career_Site',
  },
  'workday:stanfordhealthcare/SHC_External_Career_Site': {
    tenantHost: 'stanfordhealthcare.wd5.myworkdayjobs.com',
    tenant: 'stanfordhealthcare',
    site: 'SHC_External_Career_Site',
  },
  'workday:massgeneralbrigham/MGBExternal': {
    tenantHost: 'massgeneralbrigham.wd1.myworkdayjobs.com',
    tenant: 'massgeneralbrigham',
    site: 'MGBExternal',
  },
  'workday:saintlukes/saintlukeshealthcareers': {
    tenantHost: 'saintlukes.wd1.myworkdayjobs.com',
    tenant: 'saintlukes',
    site: 'saintlukeshealthcareers',
  },
  'workday:elevancehealth/ANT': {
    tenantHost: 'elevancehealth.wd1.myworkdayjobs.com',
    tenant: 'elevancehealth',
    site: 'ANT',
  },
}

function htmlToText(html: string): string {
  if (!html) return ''
  const decode = (s: string) => s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  let s = decode(decode(html))
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*p\s*>/gi, '\n\n')
       .replace(/<\s*\/\s*div\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ')
       .replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*\/\s*ul\s*>/gi, '\n')
       .replace(/<[^>]+>/g, '')
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

interface ExternalPathInfo { externalPath: string; tenant: { tenantHost: string; tenant: string; site: string } | null }

/**
 * The apply_url for a Workday job looks like:
 *   https://{tenantHost}/{site}/job/{location}/{title}_{id}
 * Convert that to the detail-API URL by combining tenant lookup with the
 * portion of the path after `/${site}`. We use the explicit WORKDAY_TENANTS
 * map (keyed by source tag) so we don't have to URL-parse loosely.
 */
function deriveExternalPath(applyUrl: string, sourceTag: string): ExternalPathInfo {
  const tenant = WORKDAY_TENANTS[sourceTag] ?? null
  if (!tenant) return { externalPath: '', tenant: null }
  try {
    const u = new URL(applyUrl)
    // pathname looks like `/ClevelandClinicCareers/job/.../...`
    // externalPath should be `/job/.../...` (everything after `/{site}`)
    const sitePrefix = `/${tenant.site}`
    if (!u.pathname.startsWith(sitePrefix)) return { externalPath: '', tenant: null }
    const externalPath = u.pathname.slice(sitePrefix.length)
    return { externalPath, tenant }
  } catch {
    return { externalPath: '', tenant: null }
  }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Parse body (optional).
  let body: { limit?: number; board?: string; min_length?: number; dry_run?: boolean } = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch {}
  }
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
  const minLength = Math.max(body.min_length ?? 300, 50)
  const dryRun = body.dry_run === true
  const startedAt = Date.now()

  // Pick the next batch of Workday jobs that look short. ORDER BY id to
  // produce a deterministic walk through the backlog so consecutive
  // invocations make forward progress instead of re-rolling the same set.
  let query = supabase
    .from('public_jobs')
    .select('id, slug, source, apply_url, description')
    .like('source', 'workday:%')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(limit)
  if (body.board) query = query.eq('source', body.board)

  const { data: rows, error: selErr } = await query
  if (selErr) {
    return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // PostgREST has no `length(description) < N` filter, so we cap candidate
  // rows in JS after fetching. Worst case we fetch `limit` rows and skip
  // most of them — fine at limit ≤ 200.
  const candidates = (rows ?? []).filter((r) =>
    typeof r.description === 'string' && r.description.length < minLength,
  )

  const PARALLEL = 8  // detail fetches per batch; under WD's per-tenant rate ceiling
  const updates: Array<{ id: string; description: string }> = []
  const skipped: Array<{ id: string; reason: string }> = []
  const fetchErrors: string[] = []

  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const batch = candidates.slice(i, i + PARALLEL)
    await Promise.all(batch.map(async (row) => {
      const { externalPath, tenant } = deriveExternalPath(row.apply_url ?? '', row.source)
      if (!tenant || !externalPath) {
        skipped.push({ id: String(row.id), reason: 'cannot derive externalPath' })
        return
      }
      const detailUrl = `https://${tenant.tenantHost}/wday/cxs/${tenant.tenant}/${tenant.site}${externalPath}`
      try {
        const r = await fetch(detailUrl, {
          headers: { Accept: 'application/json', 'User-Agent': WORKDAY_UA },
        })
        if (!r.ok) {
          fetchErrors.push(`${row.id} (${r.status})`)
          return
        }
        const dd = await r.json() as { jobPostingInfo?: { jobDescription?: string } }
        const html = dd?.jobPostingInfo?.jobDescription ?? ''
        if (!html) {
          skipped.push({ id: String(row.id), reason: 'no jobDescription in response' })
          return
        }
        const text = htmlToText(html)
        if (text.length <= (row.description ?? '').length) {
          skipped.push({ id: String(row.id), reason: 'detail-fetch description not longer than current' })
          return
        }
        updates.push({ id: String(row.id), description: text })
      } catch (e) {
        fetchErrors.push(`${row.id} (${e instanceof Error ? e.message : String(e)})`)
      }
    }))
  }

  // Apply the UPDATEs. Doing them one row at a time keeps semantics simple
  // (per-row error isolation) and at limit ≤ 200 the round-trip cost is
  // acceptable. Use a batched RPC if this ever needs to scale.
  let updated = 0
  if (!dryRun) {
    for (const u of updates) {
      const { error } = await supabase
        .from('public_jobs')
        .update({ description: u.description })
        .eq('id', u.id)
      if (error) {
        fetchErrors.push(`update ${u.id}: ${error.message}`)
      } else {
        updated++
      }
    }
  }

  return new Response(JSON.stringify({
    ok: fetchErrors.length === 0,
    inspected: rows?.length ?? 0,
    candidates: candidates.length,
    updated: dryRun ? 0 : updated,
    would_update: dryRun ? updates.length : null,
    skipped: skipped.length,
    fetch_errors: fetchErrors.length,
    sample_errors: fetchErrors.slice(0, 5),
    sample_skips: skipped.slice(0, 5),
    duration_ms: Date.now() - startedAt,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
