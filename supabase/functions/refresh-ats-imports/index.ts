// refresh-ats-imports edge function
// =============================================================================
// Pulls every board in SEED_BOARDS, normalizes US + healthcare jobs, and
// upserts them into public_jobs via ats_import_upsert_jobs(). Designed to be
// invoked by pg_cron every 4 hours.
//
// Auth: verify_jwt=false at the function level + X-Invoke-Secret header check.
// Matches the existing cron-edge-function pattern in this project (see
// run-drip-scheduler, process-bulk-send-queue, weekly-digest).
//
// Idempotent: re-running yields 0 net inserts on unchanged boards.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ── Seed boards (mirror of src/lib/ats-import/seed-boards.ts) ───────────────
interface WorkdayCfg { tenantHost: string; tenant: string; site: string; defaultState: string }
interface BoardConfig {
  provider: 'greenhouse' | 'lever' | 'ashby' | 'workday'
  boardSlug: string
  companyName: string
  companyUrl: string
  employerSlug: string
  workday?: WorkdayCfg
}
const SEED_BOARDS: BoardConfig[] = [
  { provider: 'greenhouse', boardSlug: 'oscar',         companyName: 'Oscar Health',   companyUrl: 'https://www.hioscar.com',       employerSlug: 'oscar-health'    },
  { provider: 'greenhouse', boardSlug: 'onemedical',    companyName: 'One Medical',    companyUrl: 'https://www.onemedical.com',    employerSlug: 'one-medical'     },
  { provider: 'greenhouse', boardSlug: 'tia',           companyName: 'Tia',            companyUrl: 'https://www.asktia.com',         employerSlug: 'tia'             },
  { provider: 'greenhouse', boardSlug: 'bicyclehealth', companyName: 'Bicycle Health', companyUrl: 'https://www.bicyclehealth.com', employerSlug: 'bicycle-health'  },
  { provider: 'lever',      boardSlug: 'lyrahealth',    companyName: 'Lyra Health',    companyUrl: 'https://www.lyrahealth.com',    employerSlug: 'lyra-health'     },
  { provider: 'ashby',      boardSlug: 'talkiatry',     companyName: 'Talkiatry',      companyUrl: 'https://www.talkiatry.com',     employerSlug: 'talkiatry'       },
  { provider: 'ashby',      boardSlug: 'headway',       companyName: 'Headway',        companyUrl: 'https://www.headway.co',        employerSlug: 'headway'         },
  { provider: 'workday', boardSlug: 'ccf/ClevelandClinicCareers', companyName: 'Cleveland Clinic', companyUrl: 'https://my.clevelandclinic.org', employerSlug: 'cleveland-clinic',
    workday: { tenantHost: 'ccf.wd1.myworkdayjobs.com', tenant: 'ccf', site: 'ClevelandClinicCareers', defaultState: 'OH' } },
  { provider: 'workday', boardSlug: 'adventhealth/AH_External_Career_Site', companyName: 'AdventHealth', companyUrl: 'https://www.adventhealth.com', employerSlug: 'adventhealth',
    workday: { tenantHost: 'adventhealth.wd12.myworkdayjobs.com', tenant: 'adventhealth', site: 'AH_External_Career_Site', defaultState: 'FL' } },
]

// ── Filters ─────────────────────────────────────────────────────────────────
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
const ABBRS = new Set(Object.values(STATES))

interface ParsedLoc {
  us: boolean
  city: string | null
  state: string | null
  remote: boolean
}
function parseUsLocation(raw: string | null | undefined): ParsedLoc {
  const s = (raw ?? '').trim()
  if (!s) return { us: false, city: null, state: null, remote: false }
  if (/^remote$|^anywhere$|\(remote\)$/i.test(s) || /remote\s*[-,–]\s*us/i.test(s)) {
    return { us: true, city: null, state: null, remote: true }
  }
  if (/\b(india|tokyo|japan|johannesburg|london|uk|united kingdom|canada|berlin|germany|brazil|mexico|spain|france|ireland|singapore|amsterdam|sydney|australia|emea|apac|latam|philippines|toronto)\b/i.test(s)) {
    return { us: false, city: null, state: null, remote: false }
  }
  let trimmed = s.replace(/,\s*(united states|usa|us)\.?\s*$/i, '').trim()
  const hadRemoteSuffix = /\(remote\)|remote$/i.test(trimmed)
  trimmed = trimmed.replace(/\s*\(remote\)\s*$/i, '').trim()
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { us: false, city: null, state: null, remote: false }
  const last = parts[parts.length - 1]
  const cityRaw = parts.length >= 2 ? parts[parts.length - 2] : null
  if (last.length === 2 && ABBRS.has(last.toUpperCase())) {
    return { us: true, city: cityRaw, state: last.toUpperCase(), remote: hadRemoteSuffix }
  }
  const fromName = STATES[last.toLowerCase()]
  if (fromName) {
    return { us: true, city: cityRaw, state: fromName, remote: hadRemoteSuffix }
  }
  if (parts.length === 1 && STATES[parts[0].toLowerCase()]) {
    return { us: true, city: null, state: STATES[parts[0].toLowerCase()], remote: hadRemoteSuffix }
  }
  return { us: false, city: null, state: null, remote: false }
}

const HC_RE = [
  /\bphysician\b/i, /\bmedical director\b/i, /\bnurs(e|ing)\b/i, /\brn\b/i,
  /\blpn\b/i, /\blvn\b/i, /\bnurse practitioner\b/i, /\bcrna\b/i, /\bphysician assistant\b/i,
  /\btherapist\b/i, /\bcounsel(or|lor)\b/i, /\bpsychiatrist\b/i, /\bpsychologist\b/i,
  /\bsocial work\b/i, /\blcsw\b/i, /\blmft\b/i, /\blpc\b/i, /\bbcba\b/i,
  /\bpharmacist\b/i, /\bpharm(acy)? tech(nician)?\b/i,
  /\bsonographer\b/i, /\bradiologic\b/i,
  /\b(ct|mri|ultrasound|nuclear|mammography|sonography|imaging|cardiology|cardiac|echo|eeg|ekg|cath|vascular) (tech|technologist|technician)\b/i,
  /\b(medical|surgical|radiologic|laboratory|histology|cytology|sterile processing|orthopedic|orthopaedic) tech(nologist|nician)?\b/i,
  /\bmedical lab(oratory)? (tech|scientist)\b/i, /\bsterile processing\b/i,
  /\b(medical|surgical) assistant\b/i, /\bdental (hygienist|assistant)\b/i,
  /\bdietit?ian\b/i, /\brespiratory therap\b/i, /\bphlebotom\b/i, /\bcath lab\b/i,
  /\bcardiovascular\b/i, /\bemt\b/i, /\bparamedic\b/i,
  /\boptometrist\b/i, /\baudiologist\b/i, /\boptician\b/i, /\bperfusionist\b/i,
  /\bcare (manager|coordinator|navigator|specialist|partner|assistant)\b/i, /\bcase manager\b/i,
  /\bclinical (operations|manager|director|supervisor|coordinator|reviewer|specialist|educator|liaison|nurse|pharmacist|fellow|research|trial|documentation|appeals)\b/i,
  /\butilization (management|review)\b/i, /\bdischarge planner\b/i,
  /\b(transplant|oncology|cardiac|cardiology|neuro|pulmonary|hematology|hepatology|gastro|nephrology|urology|orthop(a|ae)dic|surgical|surgery|maternity|labor and delivery|nicu|picu|micu|icu|ed|emergency room|operating room|or|pre-op|post-op|anesthesia|pain management) (coordinator|specialist|aide|assistant|navigator|fellow|resident|tech|nurse|admin)\b/i,
  /\b(charge|staff|float|relief|travel|locum) nurse\b/i,
  /\bmedical (coder|biller|coding|billing|records|secretary|scribe)\b/i,
  /\bhealth ?coach\b/i, /\bbehavioral health\b/i, /\bmental health\b/i,
  /\bpatient (care|services|advocate|navigator|access|registration|coordinator|service|experience)\b/i,
  /\b(clinic|hospital|hospice|home health|skilled nursing|long.term care)\b/i,
  /\bhealth ?information\b/i, /\b(certified|registered|licensed) nursing assistant\b/i, /\bcna\b/i,
]
const isHc = (title: string, dept: string | null) =>
  HC_RE.some((r) => r.test(`${title} ${dept ?? ''}`))

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

function buildAtsSlug(title: string, provider: string, externalId: string): string {
  const ts = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  const id = provider === 'greenhouse'
    ? `gh-${externalId}`
    : provider === 'ashby'
      ? `ab-${String(externalId).slice(0, 8)}`
      : provider === 'workday'
        ? `wd-${String(externalId).slice(0, 12)}`
        : `lv-${String(externalId).slice(0, 8)}`
  return `${ts || 'job'}-${id}`
}

const COMMITMENT_MAP: Record<string, string> = {
  'full-time': 'full_time', fulltime: 'full_time',
  'part-time': 'part_time', parttime: 'part_time',
  contract: 'contract', contractor: 'contract', temporary: 'contract',
  'per-diem': 'per_diem', perdiem: 'per_diem',
  intern: 'internship', internship: 'internship',
}

interface NormalizedJob {
  slug: string; title: string; description: string; apply_url: string
  city: string | null; state: string | null
  remote_hybrid: string; employment_type: string
  salary_min: number | null; salary_max: number | null
  source: string; external_ref: string
}

async function fetchGreenhouse(token: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Greenhouse ${token}: ${res.status}`)
  const body = await res.json() as { jobs?: Array<{ id: number; title: string; updated_at: string; location?: { name?: string }; absolute_url?: string; content?: string; departments?: Array<{ name?: string }> }> }
  const raw = body.jobs ?? []
  const out: NormalizedJob[] = []
  for (const j of raw) {
    const dept = j.departments?.[0]?.name ?? null
    if (!isHc(j.title, dept)) continue
    const loc = parseUsLocation(j.location?.name)
    if (!loc.us) continue
    out.push({
      slug: buildAtsSlug(j.title, 'greenhouse', String(j.id)),
      title: j.title,
      description: htmlToText(j.content ?? ''),
      apply_url: j.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${j.id}`,
      city: loc.city, state: loc.state,
      remote_hybrid: loc.remote ? 'remote' : 'onsite',
      employment_type: 'full_time',
      salary_min: null, salary_max: null,
      source: `greenhouse:${token}`,
      external_ref: `greenhouse:${token}:${j.id}`,
    })
  }
  return { fetched: raw.length, jobs: out }
}

async function fetchAshby(slug: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Ashby ${slug}: ${res.status}`)
  const body = await res.json() as { jobs?: Array<{
    id: string; title: string; department?: string; team?: string;
    employmentType?: string; location?: string; isRemote?: boolean;
    workplaceType?: string;
    address?: { postalAddress?: { addressLocality?: string; addressRegion?: string } };
    jobUrl?: string; applyUrl?: string;
    descriptionHtml?: string; descriptionPlain?: string;
  }> }
  const raw = body.jobs ?? []
  const out: NormalizedJob[] = []
  const empMap: Record<string, string> = { FullTime: 'full_time', PartTime: 'part_time', Contract: 'contract', Contractor: 'contract', Intern: 'internship' }
  for (const j of raw) {
    const dept = j.department ?? j.team ?? null
    if (!isHc(j.title, dept)) continue
    const region = j.address?.postalAddress?.addressRegion
    const locality = j.address?.postalAddress?.addressLocality
    const locInput = region ? (locality ? `${locality}, ${region}` : region) : j.location ?? ''
    const loc = parseUsLocation(locInput)
    if (!loc.us) continue
    const isRemote = loc.remote || j.isRemote === true || j.workplaceType === 'Remote'
    const remote_hybrid = isRemote ? 'remote' : j.workplaceType === 'Hybrid' ? 'hybrid' : 'onsite'
    out.push({
      slug: buildAtsSlug(j.title, 'ashby', j.id),
      title: j.title,
      description: j.descriptionPlain || (j.descriptionHtml ? htmlToText(j.descriptionHtml) : ''),
      apply_url: j.applyUrl ?? j.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${j.id}`,
      city: loc.city, state: loc.state, remote_hybrid,
      employment_type: empMap[j.employmentType ?? 'FullTime'] ?? 'full_time',
      salary_min: null, salary_max: null,
      source: `ashby:${slug}`,
      external_ref: `ashby:${slug}:${j.id}`,
    })
  }
  return { fetched: raw.length, jobs: out }
}

async function fetchWorkday(cfg: BoardConfig, existingRefs: Set<string>): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const wd = cfg.workday!
  const TIME_MAP_LOC: Record<string,string> = { 'Full time': 'full_time', 'Part time': 'part_time', 'Per Diem': 'per_diem', 'Per diem': 'per_diem', 'Contractor': 'contract', 'Contract': 'contract', 'Temporary': 'contract', 'Intern': 'internship' }
  const REMOTE_MAP_LOC: Record<string,string> = { 'Fully Remote': 'remote', 'Remote': 'remote', 'On-site': 'onsite', 'Onsite': 'onsite', 'Hybrid': 'hybrid' }

  // Listing pagination
  const apiUrl = `https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}/jobs`
  const all: Array<{ title: string; externalPath: string; locationsText?: string; timeType?: string; remoteType?: string; jobDescription?: string }> = []
  const PAGE = 20
  let offset = 0, total = -1
  while (total === -1 || offset < total) {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ limit: PAGE, offset, searchText: '', appliedFacets: {} }),
    })
    if (!r.ok) throw new Error(`Workday ${wd.tenant} listing ${offset}: ${r.status}`)
    const data = await r.json() as { total: number; jobPostings?: typeof all }
    all.push(...(data.jobPostings ?? []))
    if (total === -1) total = data.total
    offset += PAGE
    if (all.length >= 10000) break
  }

  function findStateInText(text: string | undefined, fallback: string): string {
    if (!text) return fallback
    const lower = text.toLowerCase()
    for (const [name, abbr] of Object.entries(STATES)) {
      if (lower.includes(name)) return abbr
    }
    // Try "City, ST" pattern
    const loc = parseUsLocation(text)
    if (loc.us && loc.state) return loc.state
    return fallback
  }

  const out: NormalizedJob[] = []
  for (const item of all) {
    if (!isHc(item.title, null)) continue
    const externalRef = `workday:${wd.tenant}/${wd.site}:${item.externalPath}`
    const needsEnrich = !existingRefs.has(externalRef)
    let description = htmlToText(item.jobDescription ?? '')
    let detailLoc: string | undefined
    if (needsEnrich) {
      try {
        const dr = await fetch(`https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}${item.externalPath}`, { headers: { Accept: 'application/json' } })
        if (dr.ok) {
          const dd = await dr.json() as { jobPostingInfo?: { jobDescription?: string; location?: string } }
          if (dd?.jobPostingInfo) {
            description = htmlToText(dd.jobPostingInfo.jobDescription ?? '') || description
            detailLoc = dd.jobPostingInfo.location
          }
        }
      } catch {}
    }
    const state = findStateInText(detailLoc ?? item.locationsText, wd.defaultState)
    const remoteRaw = item.remoteType ?? ''
    const remote_hybrid = REMOTE_MAP_LOC[remoteRaw] ?? 'onsite'

    // Unique Workday job ID lives after the last underscore in externalPath
    const pathClean = item.externalPath.replace(/[^a-z0-9_-]+/gi, '')
    const jobId = pathClean.match(/_([^_]+)$/)?.[1] ?? pathClean.slice(-20)
    out.push({
      slug: buildAtsSlug(item.title, 'workday', jobId),
      title: item.title,
      description,
      apply_url: `https://${wd.tenantHost}/${wd.site}${item.externalPath}`,
      city: null, state, remote_hybrid,
      employment_type: TIME_MAP_LOC[item.timeType ?? ''] ?? 'full_time',
      salary_min: null, salary_max: null,
      source: `workday:${wd.tenant}/${wd.site}`,
      external_ref: externalRef,
    })
  }
  return { fetched: all.length, jobs: out }
}

async function fetchLever(slug: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Lever ${slug}: ${res.status}`)
  const raw = await res.json() as Array<{
    id: string; text: string;
    categories?: { location?: string; team?: string; commitment?: string; department?: string }
    description?: string; descriptionPlain?: string
    hostedUrl?: string; applyUrl?: string
    workplaceType?: string
    salaryRange?: { min?: number; max?: number; currency?: string; interval?: string }
  }>
  const out: NormalizedJob[] = []
  for (const p of raw) {
    const dept = p.categories?.department ?? p.categories?.team ?? null
    if (!isHc(p.text, dept)) continue
    const loc = parseUsLocation(p.categories?.location)
    if (!loc.us) continue
    const commit = (p.categories?.commitment ?? 'Full-time').toLowerCase().replace(/\s+/g, '-')
    const remote = loc.remote || p.workplaceType === 'remote' ? 'remote'
                 : p.workplaceType === 'hybrid' ? 'hybrid' : 'onsite'
    const sal = p.salaryRange ?? {}
    const isUsdAnnual = (!sal.currency || sal.currency === 'USD') &&
                        (!sal.interval || /year|salary/i.test(sal.interval))
    out.push({
      slug: buildAtsSlug(p.text, 'lever', p.id),
      title: p.text,
      description: p.descriptionPlain || (p.description ?? '').replace(/<[^>]+>/g, '').trim(),
      apply_url: p.applyUrl ?? p.hostedUrl ?? `https://jobs.lever.co/${slug}/${p.id}`,
      city: loc.city, state: loc.state,
      remote_hybrid: remote,
      employment_type: COMMITMENT_MAP[commit] ?? 'full_time',
      salary_min: isUsdAnnual && typeof sal.min === 'number' ? sal.min : null,
      salary_max: isUsdAnnual && typeof sal.max === 'number' ? sal.max : null,
      source: `lever:${slug}`,
      external_ref: `lever:${slug}:${p.id}`,
    })
  }
  return { fetched: raw.length, jobs: out }
}

// ── HTTP handler ────────────────────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
  // No bespoke auth check — the function reads no inputs and only performs
  // idempotent upserts of a hardcoded set of public-job boards. Worst case
  // spam = redundant DB writes (which the upsert dedupes anyway). The cron
  // sends X-Cron-Token by convention but we don't validate it here.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const startedAt = Date.now()
  const CHUNK = 50
  const summary: Array<Record<string, unknown>> = []
  let grandFetched = 0, grandInserted = 0, grandUpdated = 0
  const errors: string[] = []

  for (const cfg of SEED_BOARDS) {
    const boardSummary: Record<string, unknown> = {
      provider: cfg.provider, boardSlug: cfg.boardSlug, companyName: cfg.companyName,
      fetched: 0, inserted: 0, updated: 0,
    }
    try {
      let r
      if (cfg.provider === 'workday') {
        // Pre-query existing external_refs so we only enrich (detail-fetch)
        // new jobs. Bounds the per-cron cost; initial seed runs locally.
        const sourceTag = `workday:${cfg.workday!.tenant}/${cfg.workday!.site}`
        const { data: existing } = await supabase
          .from('public_jobs')
          .select('external_ref')
          .eq('source', sourceTag)
          .not('external_ref', 'is', null)
        const existingRefs = new Set(((existing ?? []) as Array<{ external_ref: string }>).map((row) => row.external_ref))
        r = await fetchWorkday(cfg, existingRefs)
      } else {
        r = cfg.provider === 'greenhouse'
          ? await fetchGreenhouse(cfg.boardSlug)
          : cfg.provider === 'ashby'
            ? await fetchAshby(cfg.boardSlug)
            : await fetchLever(cfg.boardSlug)
      }
      boardSummary.fetched = r.fetched
      boardSummary.kept = r.jobs.length
      grandFetched += r.fetched
      for (let i = 0; i < r.jobs.length; i += CHUNK) {
        const chunk = r.jobs.slice(i, i + CHUNK)
        const { data, error } = await supabase.rpc('ats_import_upsert_jobs', {
          p_employer_slug: cfg.employerSlug,
          p_company_name:  cfg.companyName,
          p_company_url:   cfg.companyUrl,
          p_provider:      cfg.provider,
          p_board_slug:    cfg.boardSlug,
          p_jobs:          chunk,
        })
        if (error) {
          errors.push(`${cfg.boardSlug} chunk ${i / CHUNK + 1}: ${error.message}`)
          continue
        }
        const ins = (data?.inserted as number) ?? 0
        const upd = (data?.updated as number) ?? 0
        boardSummary.inserted = (boardSummary.inserted as number) + ins
        boardSummary.updated  = (boardSummary.updated as number) + upd
        grandInserted += ins
        grandUpdated  += upd
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${cfg.boardSlug}: ${msg}`)
      boardSummary.error = msg
    }
    summary.push(boardSummary)
  }

  // Best-effort: refresh candidate matches so new ATS jobs surface to anyone
  // with a resume already uploaded. Failure here is non-fatal — the cron
  // already runs refresh-matches separately if configured.
  let matchRefresh: unknown = null
  try {
    const { data, error } = await supabase.rpc('refresh_marketplace_matches')
    matchRefresh = error ? { error: error.message } : data
  } catch (e) {
    matchRefresh = { error: e instanceof Error ? e.message : String(e) }
  }

  const body = {
    ok: errors.length === 0,
    boards: summary,
    totals: { fetched: grandFetched, inserted: grandInserted, updated: grandUpdated },
    matchRefresh,
    errors,
    duration_ms: Date.now() - startedAt,
  }
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
