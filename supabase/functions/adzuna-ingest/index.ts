// adzuna-ingest edge function
// =============================================================================
// Ingests US healthcare jobs from the Adzuna v1 search API. Adzuna aggregates
// from many employers; we ingest by healthcare-relevant category, dedupe
// against existing inventory by URL match, and upsert via the same
// ats_import_upsert_jobs RPC as the rest of the ATS pipeline.
//
// v1 (2026-05-27): initial scaffolding. Standalone function (not bolted onto
//   refresh-ats-imports) to keep that function lean — see v26 deploy notes
//   for why concentrating all ingestion in one function blew the 150s edge
//   cap. Runs on its own cron at :37 every 4 hours (10 min offset from
//   refresh-ats-imports at :17 and backfill at :47).
//
// Auth: verify_jwt=false. Reads `adzuna_app_id` + `adzuna_app_key` from
// Supabase vault via get_vault_secret RPC. Returns ok=false (no-op) if
// either secret is missing — safe to deploy before credentials are wired.
//
// Idempotent: external_ref includes Adzuna's stable job id.
//
// Strategy notes:
//   - Adzuna's free tier caps at 1000 calls/day. We use ~24 calls/day
//     (6 cron ticks × 4 healthcare categories per tick) — well under cap.
//   - Healthcare categories: 'healthcare-nursing-jobs' is the biggest;
//     'social-care-jobs' covers therapy + counseling.
//   - Each call fetches 50 results (Adzuna's per-page cap on free tier).
//   - apply_url uses Adzuna's redirect_url — clicks attribute via
//     the existing /click/[slug] tracking pipeline.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

function fetchWithTimeout(input: string | URL, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init
  return fetch(input, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
}

// Adzuna's category slugs that map to our healthcare bucket. Each gets a
// separate API call and a distinct source tag.
//
// 2026-05-27: corrected `social-care-jobs` → `social-work-jobs`. The
// social-care label is Adzuna's UK taxonomy; the US instance uses
// social-work-jobs. The wrong slug returned nginx 400 silently — the
// function caught the error in errors[] but the cron output showed
// 0 social-care rows for 8+ hours before we noticed. Verified against
// GET /v1/api/jobs/us/categories: US has {healthcare-nursing-jobs,
// social-work-jobs, scientific-qa-jobs, ...} and social-work covers
// counselors, case managers, behavioral-health aides, and licensed
// clinical social workers — all healthcare-relevant.
const ADZUNA_CATEGORIES = [
  { slug: 'healthcare-nursing-jobs',     label: 'Healthcare & Nursing' },
  { slug: 'social-work-jobs',            label: 'Social Work' },
] as const

// US states map — keep in sync with the same dict in refresh-ats-imports.
const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC', 'washington dc': 'DC',
}

function buildSlug(title: string, externalId: string): string {
  const ts = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  return `${ts || 'job'}-az-${String(externalId).slice(0, 14)}`
}

function htmlToText(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface AdzunaJob {
  id: string
  title: string
  description?: string
  location?: { display_name?: string; area?: string[] }
  salary_min?: number
  salary_max?: number
  salary_is_predicted?: string  // '0' or '1'
  contract_time?: string  // 'full_time' | 'part_time'
  contract_type?: string  // 'permanent' | 'contract'
  redirect_url?: string
  company?: { display_name?: string }
  created?: string  // ISO date
}

interface NormalizedJob {
  slug: string
  title: string
  description: string
  apply_url: string
  city: string | null
  state: string | null
  remote_hybrid: string
  employment_type: string
  salary_min: number | null
  salary_max: number | null
  source: string
  external_ref: string
}

async function fetchAdzunaCategory(appId: string, appKey: string, category: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  // 50 results/page is Adzuna's free-tier cap. Single page per category
  // per cron tick — we'll get a fresh slice each 4hr cycle.
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/us/search/1`)
  url.searchParams.set('app_id', appId)
  url.searchParams.set('app_key', appKey)
  url.searchParams.set('results_per_page', '50')
  url.searchParams.set('category', category)
  url.searchParams.set('sort_by', 'date')  // newest first
  url.searchParams.set('content-type', 'application/json')

  const res = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' }, timeoutMs: 15000 })
  if (!res.ok) throw new Error(`Adzuna ${category}: ${res.status}`)

  const body = await res.json() as { results?: AdzunaJob[]; count?: number }
  const raw = body.results ?? []
  const out: NormalizedJob[] = []

  for (const j of raw) {
    if (!j.id || !j.title) continue
    if (!j.redirect_url) continue

    // Parse state from location.area (Adzuna shape: ['US', 'Texas', 'Houston'])
    const area = j.location?.area ?? []
    const stateName = (area[1] ?? '').toLowerCase()
    const state = STATES[stateName] ?? null
    if (!state) continue
    const city = area[2] ?? null

    const employment_type =
      j.contract_time === 'part_time' ? 'part_time'
        : j.contract_type === 'contract' ? 'contract'
        : 'full_time'

    // Only trust salary if NOT predicted by Adzuna's model. We want real
    // employer-disclosed numbers to flow through to baseSalary JSON-LD;
    // model-predicted ranges could mislead candidates.
    const trustSalary = j.salary_is_predicted !== '1'

    out.push({
      slug: buildSlug(j.title, j.id),
      title: j.title,
      description: htmlToText(j.description ?? ''),
      apply_url: j.redirect_url,
      city: city || null,
      state,
      remote_hybrid: 'onsite',  // Adzuna doesn't tag remote consistently
      employment_type,
      salary_min: trustSalary && typeof j.salary_min === 'number' ? Math.round(j.salary_min) : null,
      salary_max: trustSalary && typeof j.salary_max === 'number' ? Math.round(j.salary_max) : null,
      source: `adzuna:${category}`,
      external_ref: `adzuna:${category}:${j.id}`,
    })
  }
  return { fetched: raw.length, jobs: out }
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = Date.now()

  // Fetch Adzuna credentials from vault. If either is missing, the function
  // is a no-op — safe to deploy before the user has registered + provisioned.
  let appId: string | null = null
  let appKey: string | null = null
  try {
    const idResult = await supabase.rpc('get_vault_secret', { secret_name: 'adzuna_app_id' })
    const keyResult = await supabase.rpc('get_vault_secret', { secret_name: 'adzuna_app_key' })
    appId = (idResult.data as string | null) || null
    appKey = (keyResult.data as string | null) || null
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      stage: 'vault',
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  if (!appId || !appKey) {
    return new Response(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'adzuna_app_id and/or adzuna_app_key not set in vault. Function is a no-op until credentials are provisioned. See docs/ADZUNA_SETUP.md.',
      duration_ms: Date.now() - startedAt,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  }

  const CHUNK = 50
  const summary: Array<Record<string, unknown>> = []
  let grandFetched = 0, grandInserted = 0, grandUpdated = 0
  const errors: string[] = []

  for (const cat of ADZUNA_CATEGORIES) {
    const boardSummary: Record<string, unknown> = {
      category: cat.slug,
      label: cat.label,
      fetched: 0,
      inserted: 0,
      updated: 0,
    }
    try {
      const r = await fetchAdzunaCategory(appId, appKey, cat.slug)
      boardSummary.fetched = r.fetched
      boardSummary.kept = r.jobs.length
      grandFetched += r.fetched

      // Same upsert path as the rest of the ATS pipeline. Adzuna is treated
      // as its own "employer" for now (a meta-source); we can promote
      // individual employer companies out of this bucket later by inspecting
      // the company.display_name field.
      for (let i = 0; i < r.jobs.length; i += CHUNK) {
        const chunk = r.jobs.slice(i, i + CHUNK)
        const { data, error } = await supabase.rpc('ats_import_upsert_jobs', {
          p_employer_slug: 'adzuna-aggregator',
          p_company_name: 'Adzuna (aggregator)',
          p_company_url: 'https://www.adzuna.com',
          p_provider: 'adzuna',
          p_board_slug: cat.slug,
          p_jobs: chunk,
        })
        if (error) {
          errors.push(`${cat.slug} chunk ${i / CHUNK + 1}: ${error.message}`)
          continue
        }
        const ins = (data?.inserted as number) ?? 0
        const upd = (data?.updated as number) ?? 0
        boardSummary.inserted = (boardSummary.inserted as number) + ins
        boardSummary.updated = (boardSummary.updated as number) + upd
        grandInserted += ins
        grandUpdated += upd
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${cat.slug}: ${msg}`)
      boardSummary.error = msg
    }
    summary.push(boardSummary)
  }

  const body = {
    ok: errors.length === 0,
    categories: summary,
    totals: { fetched: grandFetched, inserted: grandInserted, updated: grandUpdated },
    errors,
    duration_ms: Date.now() - startedAt,
  }
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
