// backfill-workday-descriptions edge function
// =============================================================================
// One-shot rate-limited backfill for Workday jobs whose description was
// captured from the listing endpoint (≤150-char preview or empty) instead
// of the full job-detail endpoint. Iterates jobs in batches, fetches the
// jobPostingInfo.jobDescription, and UPDATEs public_jobs in place.
//
// v5 (2026-05-26): add Banner Health, Ochsner Health, Highmark Health,
//   NewYork-Presbyterian to WORKDAY_TENANTS map. v4 was missing all four,
//   so every backfill candidate from those sources skipped with
//   'cannot derive externalPath'. The 00:47 UTC scheduled cron tick
//   skipped 18/50 candidates — all Ochsner. Fix puts the new boards on
//   equal footing with the original six. Post-fix verification:
//   Ochsner-only run hit 50/50 updated, 0 skipped, 0 errors.
// v3 (2026-05-17): switch SELECT + UPDATE to the SECURITY DEFINER RPC pair
//   (get_workday_backfill_candidates, apply_workday_description_backfill).
// v2 (2026-05-17): verify_jwt=false, matches the cron-edge-function
//   convention used by refresh-ats-imports / run-drip-scheduler.
//
// Background: refresh-ats-imports caps detail-fetch enrichment at 100 NEW
// jobs per board per cron tick. Existing thin-description jobs stay thin
// until this function picks them up.
//
// Idempotent: only updates rows whose current description is shorter than
// `min_length` chars (default 300) AND only when the freshly fetched
// description is strictly longer than the current one.
//
// Input body (all optional):
//   { limit?: number,      // jobs per invocation, default 50, max 200
//     board?: string,      // restrict to one source tag
//     min_length?: number, // re-hydrate threshold, default 300
//     dry_run?: boolean }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const WORKDAY_UA = 'freejobpost.co/aggregator (alex@avahealth.co)'

// Hard-coded mapping of source-tag → (tenantHost, tenant, site). Mirrors
// the Workday entries in refresh-ats-imports SEED_BOARDS — keep in sync.
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
  // ── v5 additions (2026-05-26) ───────────────────────────────────────────
  'workday:bannerhealth/Careers': {
    tenantHost: 'bannerhealth.wd108.myworkdayjobs.com',
    tenant: 'bannerhealth',
    site: 'Careers',
  },
  'workday:ochsner/Ochsner': {
    tenantHost: 'ochsner.wd1.myworkdayjobs.com',
    tenant: 'ochsner',
    site: 'Ochsner',
  },
  'workday:highmarkhealth/highmark': {
    tenantHost: 'highmarkhealth.wd1.myworkdayjobs.com',
    tenant: 'highmarkhealth',
    site: 'highmark',
  },
  'workday:nyp/nypcareers': {
    tenantHost: 'nyp.wd1.myworkdayjobs.com',
    tenant: 'nyp',
    site: 'nypcareers',
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

function deriveExternalPath(applyUrl: string, sourceTag: string): ExternalPathInfo {
  const tenant = WORKDAY_TENANTS[sourceTag] ?? null
  if (!tenant) return { externalPath: '', tenant: null }
  try {
    const u = new URL(applyUrl)
    const sitePrefix = `/${tenant.site}`
    if (!u.pathname.startsWith(sitePrefix)) return { externalPath: '', tenant: null }
    const externalPath = u.pathname.slice(sitePrefix.length)
    return { externalPath, tenant }
  } catch {
    return { externalPath: '', tenant: null }
  }
}

interface Candidate { id: string; source: string; apply_url: string; description: string }

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  let body: { limit?: number; board?: string; min_length?: number; dry_run?: boolean } = {}
  if (req.method === 'POST') {
    try { body = await req.json() } catch {}
  }
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)
  const minLength = Math.max(body.min_length ?? 300, 50)
  const dryRun = body.dry_run === true
  const startedAt = Date.now()

  const { data: candidatesRaw, error: selErr } = await supabase.rpc(
    'get_workday_backfill_candidates',
    { p_limit: limit, p_min_length: minLength, p_board: body.board ?? null },
  )
  if (selErr) {
    return new Response(JSON.stringify({ ok: false, stage: 'select', error: selErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const candidates: Candidate[] = (candidatesRaw ?? []) as Candidate[]

  const PARALLEL = 8
  const updates: Array<{ id: string; description: string }> = []
  const skipped: Array<{ id: string; reason: string }> = []
  const fetchErrors: string[] = []

  for (let i = 0; i < candidates.length; i += PARALLEL) {
    const batch = candidates.slice(i, i + PARALLEL)
    await Promise.all(batch.map(async (row) => {
      const { externalPath, tenant } = deriveExternalPath(row.apply_url ?? '', row.source)
      if (!tenant || !externalPath) {
        skipped.push({ id: row.id, reason: 'cannot derive externalPath' })
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
          skipped.push({ id: row.id, reason: 'no jobDescription in response' })
          return
        }
        const text = htmlToText(html)
        if (text.length <= (row.description ?? '').length) {
          skipped.push({ id: row.id, reason: 'detail-fetch description not longer than current' })
          return
        }
        updates.push({ id: row.id, description: text })
      } catch (e) {
        fetchErrors.push(`${row.id} (${e instanceof Error ? e.message : String(e)})`)
      }
    }))
  }

  let updated = 0
  if (!dryRun && updates.length > 0) {
    const { data: updResult, error: updErr } = await supabase.rpc(
      'apply_workday_description_backfill',
      { p_updates: updates },
    )
    if (updErr) {
      fetchErrors.push(`apply RPC: ${updErr.message}`)
    } else {
      updated = (updResult as number) ?? 0
    }
  }

  return new Response(JSON.stringify({
    ok: fetchErrors.length === 0,
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
