// refresh-ats-imports edge function
// v30 (2026-06-27 fix): two more can't-break correctness fixes vs v29.
//   (1) parseUsLocation lost city/state on a "City, ST (Remote)" suffix — the
//       remote-token check matched anything ending in "(Remote)" and returned a
//       generic US-remote result before the city/state parse, so e.g.
//       "Austin, TX (Remote)" fell out of its state hub. Now strips a trailing
//       "(Remote)" FIRST (remembers remote=true) and only collapses to generic
//       remote when nothing real remains ("(Remote)", "United States (Remote)",
//       "US (Remote)"); otherwise it keeps the city/state.
//   (2) HC_RE: added /\boccupational therap/i + /\bphysical therap/i so standalone
//       "Occupational Therapy" / "Physical Therapy" titles (the non-"...Therapist"
//       ones) are kept on the healthcare board.
// v29 (2026-06-25 fix): two correctness fixes vs v28, no behavior change otherwise.
//   (1) HC_RE stem regexes dropped a trailing \b on incomplete stems
//       (/\bsocial work\b/, /\brespiratory therap\b/, /\bphlebotom\b/) so the real
//       titles ("Social Worker", "Respiratory Therapy", "Phlebotomist"/"Phlebotomy")
//       never matched and were wrongly excluded from the healthcare board. Dropped
//       the trailing \b so they prefix-match.
//   (2) fetchLever isUsdAnnual matched /year|salary/ on the interval, so Lever's
//       non-annual intervals (per-month-salary, per-week-salary, per-quarter-salary,
//       per-half-year-salary) all contain "salary" and were stored as annual,
//       mis-stating pay. Now keeps only no-interval or a year-but-not-half interval.
// v28 (2026-05-29 audit): Workday page-window ROTATION. Boards larger than one
//   600-job window (AdventHealth/Cleveland/MGB) are now covered over multiple 4h
//   runs (load-neutral → no Workday throttle) instead of permanently freezing
//   their tail at the old hard 600 cap. Page 0 (newest) is always fetched.
//   Pairs with the DB sweep_stale_ats_jobs() cron: once a big board is fully
//   covered across a rotation cycle, it can be added to the sweep allowlist for
//   dead-job expiry. (v27, undocumented: added the X-Cron-Token gate.)
// v26 (2026-05-27): ENRICH_CAP=0 — skip per-job detail-fetch enrichment
//   entirely in this function. The separate backfill-workday-descriptions
//   cron (every 4hr at :47) handles all description enrichment for thin
//   rows in dedicated invocations. This removes the second-heaviest source
//   of wall-time from refresh-ats-imports (was 5-10s per Workday board)
//   and lets us put Intermountain + Cigna back on without timing out.
// v25 (2026-05-27): per-fetch AbortSignal timeouts kept as defense.
// v24 (2026-05-27): per-fetch timeouts (alone, insufficient).
// v23 (2026-05-27): 17-board rollback.
// v22-v20: various failed expansion attempts.
// v19 (2026-05-26): last fully-working baseline (10 Workday boards).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyGoogleIndexingApiBatch } from './_google-indexing.ts'

function fetchWithTimeout(input: string | URL, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init
  return fetch(input, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
}

interface WorkdayCfg { tenantHost: string; tenant: string; site: string; defaultState: string }
interface BoardConfig {
  provider: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'usajobs'
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
  { provider: 'workday', boardSlug: 'stanfordhealthcare/SHC_External_Career_Site', companyName: 'Stanford Health Care', companyUrl: 'https://stanfordhealthcare.org', employerSlug: 'stanford-health-care',
    workday: { tenantHost: 'stanfordhealthcare.wd5.myworkdayjobs.com', tenant: 'stanfordhealthcare', site: 'SHC_External_Career_Site', defaultState: 'CA' } },
  { provider: 'workday', boardSlug: 'massgeneralbrigham/MGBExternal', companyName: 'Mass General Brigham', companyUrl: 'https://www.massgeneralbrigham.org', employerSlug: 'mass-general-brigham',
    workday: { tenantHost: 'massgeneralbrigham.wd1.myworkdayjobs.com', tenant: 'massgeneralbrigham', site: 'MGBExternal', defaultState: 'MA' } },
  { provider: 'workday', boardSlug: 'saintlukes/saintlukeshealthcareers', companyName: "Saint Luke's Healthcare", companyUrl: 'https://www.saintlukeskc.org', employerSlug: 'saint-lukes-healthcare',
    workday: { tenantHost: 'saintlukes.wd1.myworkdayjobs.com', tenant: 'saintlukes', site: 'saintlukeshealthcareers', defaultState: 'MO' } },
  { provider: 'workday', boardSlug: 'elevancehealth/ANT', companyName: 'Elevance Health', companyUrl: 'https://www.elevancehealth.com', employerSlug: 'elevance-health',
    workday: { tenantHost: 'elevancehealth.wd1.myworkdayjobs.com', tenant: 'elevancehealth', site: 'ANT', defaultState: 'IN' } },
  { provider: 'workday', boardSlug: 'bannerhealth/Careers', companyName: 'Banner Health', companyUrl: 'https://www.bannerhealth.com', employerSlug: 'banner-health',
    workday: { tenantHost: 'bannerhealth.wd108.myworkdayjobs.com', tenant: 'bannerhealth', site: 'Careers', defaultState: 'AZ' } },
  { provider: 'workday', boardSlug: 'ochsner/Ochsner', companyName: 'Ochsner Health', companyUrl: 'https://www.ochsner.org', employerSlug: 'ochsner-health',
    workday: { tenantHost: 'ochsner.wd1.myworkdayjobs.com', tenant: 'ochsner', site: 'Ochsner', defaultState: 'LA' } },
  { provider: 'workday', boardSlug: 'highmarkhealth/highmark', companyName: 'Highmark Health', companyUrl: 'https://www.highmarkhealth.org', employerSlug: 'highmark-health',
    workday: { tenantHost: 'highmarkhealth.wd1.myworkdayjobs.com', tenant: 'highmarkhealth', site: 'highmark', defaultState: 'PA' } },
  { provider: 'workday', boardSlug: 'nyp/nypcareers', companyName: 'NewYork-Presbyterian', companyUrl: 'https://www.nyp.org', employerSlug: 'newyork-presbyterian',
    workday: { tenantHost: 'nyp.wd1.myworkdayjobs.com', tenant: 'nyp', site: 'nypcareers', defaultState: 'NY' } },
  { provider: 'workday', boardSlug: 'imh/IntermountainCareers', companyName: 'Intermountain Health', companyUrl: 'https://intermountainhealthcare.org', employerSlug: 'intermountain-health',
    workday: { tenantHost: 'imh.wd108.myworkdayjobs.com', tenant: 'imh', site: 'IntermountainCareers', defaultState: 'UT' } },
  { provider: 'workday', boardSlug: 'cigna/cignacareers', companyName: 'Cigna', companyUrl: 'https://www.cigna.com', employerSlug: 'cigna',
    workday: { tenantHost: 'cigna.wd5.myworkdayjobs.com', tenant: 'cigna', site: 'cignacareers', defaultState: 'CT' } },
  { provider: 'usajobs', boardSlug: 'federal', companyName: 'U.S. Federal Government', companyUrl: 'https://www.usajobs.gov', employerSlug: 'us-federal-government' },
]

const WORKDAY_UA = 'freejobpost.co/aggregator (alex@avahealth.co)'

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

interface ParsedLoc { us: boolean; city: string | null; state: string | null; remote: boolean }
function parseUsLocation(raw: string | null | undefined): ParsedLoc {
  let s = (raw ?? '').trim()
  if (!s) return { us: false, city: null, state: null, remote: false }
  // A trailing "(Remote)" is a remote FLAG on a real location, not a standalone
  // remote token — strip it FIRST (remember it) so "City, ST (Remote)" keeps its
  // city/state. If nothing real remains ("(Remote)", "United States (Remote)",
  // "US (Remote)"), it's generic US-remote.
  let remote = false
  if (/\s*\(remote\)\s*$/i.test(s)) {
    remote = true
    s = s.replace(/\s*\(remote\)\s*$/i, '').trim()
    if (!s || /^(united states|usa|u\.?s\.?a?\.?)$/i.test(s)) return { us: true, city: null, state: null, remote: true }
  }
  if (/^remote$|^anywhere$/i.test(s) || /remote\s*[-,–]\s*us/i.test(s)) return { us: true, city: null, state: null, remote: true }
  if (/\b(india|tokyo|japan|johannesburg|london|uk|united kingdom|canada|berlin|germany|brazil|mexico|spain|france|ireland|singapore|amsterdam|sydney|australia|emea|apac|latam|philippines|toronto)\b/i.test(s)) return { us: false, city: null, state: null, remote: false }
  const trimmed = s.replace(/,\s*(united states|usa|us)\.?\s*$/i, '').trim()
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { us: false, city: null, state: null, remote: false }
  const last = parts[parts.length - 1]
  const cityRaw = parts.length >= 2 ? parts[parts.length - 2] : null
  if (last.length === 2 && ABBRS.has(last.toUpperCase())) return { us: true, city: cityRaw, state: last.toUpperCase(), remote }
  const fromName = STATES[last.toLowerCase()]
  if (fromName) return { us: true, city: cityRaw, state: fromName, remote }
  if (parts.length === 1 && STATES[parts[0].toLowerCase()]) return { us: true, city: null, state: STATES[parts[0].toLowerCase()], remote }
  return { us: false, city: null, state: null, remote: false }
}

const HC_RE = [
  /\bphysician\b/i, /\bmedical director\b/i, /\bnurs(e|ing)\b/i, /\brn\b/i,
  /\blpn\b/i, /\blvn\b/i, /\bnurse practitioner\b/i, /\bcrna\b/i, /\bphysician assistant\b/i,
  /\btherapist\b/i, /\bcounsel(or|lor)\b/i, /\bpsychiatrist\b/i, /\bpsychologist\b/i,
  /\bsocial work/i, /\blcsw\b/i, /\blmft\b/i, /\blpc\b/i, /\bbcba\b/i,
  /\bpharmacist\b/i, /\bpharm(acy)? tech(nician)?\b/i,
  /\bsonographer\b/i, /\bradiologic\b/i,
  /\b(ct|mri|ultrasound|nuclear|mammography|sonography|imaging|cardiology|cardiac|echo|eeg|ekg|cath|vascular) (tech|technologist|technician)\b/i,
  /\b(medical|surgical|radiologic|laboratory|histology|cytology|sterile processing|orthopedic|orthopaedic) tech(nologist|nician)?\b/i,
  /\bmedical lab(oratory)? (tech|scientist)\b/i, /\bsterile processing\b/i,
  /\b(medical|surgical) assistant\b/i, /\bdental (hygienist|assistant)\b/i,
  /\bdietit?ian\b/i, /\brespiratory therap/i, /\boccupational therap/i, /\bphysical therap/i, /\bphlebotom/i, /\bcath lab\b/i,
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
const isHc = (title: string, dept: string | null) => HC_RE.some((r) => r.test(`${title} ${dept ?? ''}`))

function htmlToText(html: string): string {
  if (!html) return ''
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  let s = decode(decode(html))
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*p\s*>/gi, '\n\n').replace(/<\s*\/\s*div\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ').replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*\/\s*ul\s*>/gi, '\n').replace(/<[^>]+>/g, '')
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function buildAtsSlug(title: string, provider: string, externalId: string): string {
  const ts = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  const id = provider === 'greenhouse' ? `gh-${externalId}` : provider === 'ashby' ? `ab-${String(externalId).slice(0, 8)}` : provider === 'workday' ? `wd-${String(externalId).slice(0, 12)}` : provider === 'usajobs' ? `uj-${externalId}` : `lv-${String(externalId).slice(0, 8)}`
  return `${ts || 'job'}-${id}`
}

const COMMITMENT_MAP: Record<string, string> = { 'full-time': 'full_time', fulltime: 'full_time', 'part-time': 'part_time', parttime: 'part_time', contract: 'contract', contractor: 'contract', temporary: 'contract', 'per-diem': 'per_diem', perdiem: 'per_diem', intern: 'internship', internship: 'internship' }

interface NormalizedJob { slug: string; title: string; description: string; apply_url: string; city: string | null; state: string | null; remote_hybrid: string; employment_type: string; salary_min: number | null; salary_max: number | null; source: string; external_ref: string }

async function fetchGreenhouse(token: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`, { headers: { Accept: 'application/json' }, timeoutMs: 10000 })
  if (!res.ok) throw new Error(`Greenhouse ${token}: ${res.status}`)
  const body = await res.json() as { jobs?: Array<{ id: number; title: string; updated_at: string; location?: { name?: string }; absolute_url?: string; content?: string; departments?: Array<{ name?: string }> }> }
  const raw = body.jobs ?? []
  const out: NormalizedJob[] = []
  for (const j of raw) {
    const dept = j.departments?.[0]?.name ?? null
    if (!isHc(j.title, dept)) continue
    const loc = parseUsLocation(j.location?.name)
    if (!loc.us) continue
    out.push({ slug: buildAtsSlug(j.title, 'greenhouse', String(j.id)), title: j.title, description: htmlToText(j.content ?? ''), apply_url: j.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${j.id}`, city: loc.city, state: loc.state, remote_hybrid: loc.remote ? 'remote' : 'onsite', employment_type: 'full_time', salary_min: null, salary_max: null, source: `greenhouse:${token}`, external_ref: `greenhouse:${token}:${j.id}` })
  }
  return { fetched: raw.length, jobs: out }
}

async function fetchAshby(slug: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const res = await fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' }, timeoutMs: 10000 })
  if (!res.ok) throw new Error(`Ashby ${slug}: ${res.status}`)
  const body = await res.json() as { jobs?: Array<{ id: string; title: string; department?: string; team?: string; employmentType?: string; location?: string; isRemote?: boolean; workplaceType?: string; address?: { postalAddress?: { addressLocality?: string; addressRegion?: string } }; jobUrl?: string; applyUrl?: string; descriptionHtml?: string; descriptionPlain?: string }> }
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
    out.push({ slug: buildAtsSlug(j.title, 'ashby', j.id), title: j.title, description: j.descriptionPlain || (j.descriptionHtml ? htmlToText(j.descriptionHtml) : ''), apply_url: j.applyUrl ?? j.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${j.id}`, city: loc.city, state: loc.state, remote_hybrid, employment_type: empMap[j.employmentType ?? 'FullTime'] ?? 'full_time', salary_min: null, salary_max: null, source: `ashby:${slug}`, external_ref: `ashby:${slug}:${j.id}` })
  }
  return { fetched: raw.length, jobs: out }
}

async function fetchWorkday(cfg: BoardConfig): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const wd = cfg.workday!
  const TIME_MAP_LOC: Record<string,string> = { 'Full time': 'full_time', 'Part time': 'part_time', 'Per Diem': 'per_diem', 'Per diem': 'per_diem', 'Contractor': 'contract', 'Contract': 'contract', 'Temporary': 'contract', 'Intern': 'internship' }
  const REMOTE_MAP_LOC: Record<string,string> = { 'Fully Remote': 'remote', 'Remote': 'remote', 'On-site': 'onsite', 'Onsite': 'onsite', 'Hybrid': 'hybrid' }
  const apiUrl = `https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}/jobs`
  const all: Array<{ title: string; externalPath: string; locationsText?: string; timeType?: string; remoteType?: string; jobDescription?: string }> = []
  const PAGE = 20, PARALLEL = 5, MAX_JOBS = 10000, MAX_LISTING_PAGES = 30
  async function fetchPage(offset: number) {
    const r = await fetchWithTimeout(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': WORKDAY_UA }, body: JSON.stringify({ limit: PAGE, offset, searchText: '', appliedFacets: {} }), timeoutMs: 8000 })
    if (!r.ok) throw new Error(`Workday ${wd.tenant} listing ${offset}: ${r.status}`)
    return await r.json() as { total: number; jobPostings?: typeof all }
  }
  const first = await fetchPage(0).catch(() => ({ total: 0, jobPostings: [] } as { total: number; jobPostings: typeof all }))
  all.push(...(first.jobPostings ?? []))
  const total = Math.min(first.total ?? 0, MAX_JOBS)
  // Deterministic page-window ROTATION (2026-05-29 audit). A board larger than one
  // WINDOW (= PAGE*MAX_LISTING_PAGES = 600) can't be fully fetched each run without
  // ~4x-ing Workday requests → the per-IP throttle the memory warns about. Instead
  // we rotate WHICH window we fetch each 4h run, so the whole board is covered over
  // `numWindows` runs (~16h for the biggest, AdventHealth ~2300) at constant per-run
  // load. Page 0 (newest) is always fetched above for freshness + `total`. Boards
  // <= one window have numWindows=1 → full fetch every run (unchanged). The DB sweep
  // uses a 24h threshold > the ~16h max rotation period, so a live tail job is always
  // re-confirmed before it could be swept.
  const WINDOW = PAGE * MAX_LISTING_PAGES
  const numWindows = Math.max(1, Math.ceil(total / WINDOW))
  const windowIndex = Math.floor(Date.now() / (4 * 3600 * 1000)) % numWindows
  const startOffset = windowIndex * WINDOW
  const offsets: number[] = []
  for (let o = startOffset; o < Math.min(startOffset + WINDOW, total); o += PAGE) {
    if (o === 0) continue // page 0 already fetched above
    offsets.push(o)
  }
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const batch = offsets.slice(i, i + PARALLEL)
    const pages = await Promise.all(batch.map((o) => fetchPage(o).catch(() => ({ total: 0, jobPostings: [] } as { total: number; jobPostings: typeof all }))))
    for (const p of pages) all.push(...(p.jobPostings ?? []))
    if (all.length >= MAX_JOBS) break
  }
  function findStateInText(text: string | undefined, fallback: string): string {
    if (!text) return fallback
    const lower = text.toLowerCase()
    for (const [name, abbr] of Object.entries(STATES)) if (lower.includes(name)) return abbr
    const loc = parseUsLocation(text)
    if (loc.us && loc.state) return loc.state
    return fallback
  }
  const healthcare = all.filter((item) => isHc(item.title, null))
  const out: NormalizedJob[] = []
  for (const item of healthcare) {
    const externalRef = `workday:${wd.tenant}/${wd.site}:${item.externalPath}`
    const description = htmlToText(item.jobDescription ?? '')
    const state = findStateInText(item.locationsText, wd.defaultState)
    const remoteRaw = item.remoteType ?? ''
    const remote_hybrid = REMOTE_MAP_LOC[remoteRaw] ?? 'onsite'
    const pathClean = item.externalPath.replace(/[^a-z0-9_-]+/gi, '')
    const jobId = pathClean.match(/_([^_]+)$/)?.[1] ?? pathClean.slice(-20)
    out.push({ slug: buildAtsSlug(item.title, 'workday', jobId), title: item.title, description, apply_url: `https://${wd.tenantHost}/${wd.site}${item.externalPath}`, city: null, state, remote_hybrid, employment_type: TIME_MAP_LOC[item.timeType ?? ''] ?? 'full_time', salary_min: null, salary_max: null, source: `workday:${wd.tenant}/${wd.site}`, external_ref: externalRef })
  }
  return { fetched: all.length, jobs: out }
}

async function fetchUSAJobs(apiKey: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const HC_CODES = ['0601','0602','0603','0610','0620','0630','0631','0633','0635','0636','0637','0638','0644','0645','0646','0647','0648','0649','0650','0651','0660','0661','0662','0664','0665','0667','0668','0669','0670','0671','0672','0675','0679','0680','0681','0682','0683','0685','0688','0690'].join(';')
  const RESULTS_PER_PAGE = 500, MAX_PAGES = 20
  async function fetchPage(page: number) {
    const r = await fetchWithTimeout(`https://data.usajobs.gov/api/Search?JobCategoryCode=${HC_CODES}&ResultsPerPage=${RESULTS_PER_PAGE}&Page=${page}`, { headers: { Host: 'data.usajobs.gov', 'User-Agent': 'alex@avahealth.co', 'Authorization-Key': apiKey, Accept: 'application/json' }, timeoutMs: 10000 })
    if (!r.ok) throw new Error(`USAJobs page ${page}: ${r.status}`)
    return await r.json() as { SearchResult: { SearchResultCountAll?: number; SearchResultItems?: Array<{ MatchedObjectId: string; MatchedObjectDescriptor?: { PositionTitle?: string; PositionURI?: string; ApplyURI?: string[]; OrganizationName?: string; DepartmentName?: string; PositionLocation?: Array<{ CityName?: string; CountrySubDivisionCode?: string; LocationName?: string }>; JobCategory?: Array<{ Name?: string; Code?: string }>; PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string; Description?: string }>; PositionEndDate?: string; UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[]; Qualifications?: string; Requirements?: string; KeyRequirements?: string[]; Education?: string; Evaluations?: string } } } }> } }
  }
  const first = await fetchPage(1).catch(() => ({ SearchResult: { SearchResultCountAll: 0, SearchResultItems: [] } }))
  const items = [...(first.SearchResult.SearchResultItems ?? [])]
  const total = first.SearchResult.SearchResultCountAll ?? 0
  const totalPages = Math.min(MAX_PAGES, Math.ceil(total / RESULTS_PER_PAGE))
  const PARALLEL = 3
  const remaining: number[] = []
  for (let p = 2; p <= totalPages; p++) remaining.push(p)
  for (let i = 0; i < remaining.length; i += PARALLEL) {
    const batch = remaining.slice(i, i + PARALLEL)
    const pages = await Promise.all(batch.map((p) => fetchPage(p).catch(() => null)))
    for (const pg of pages) if (pg?.SearchResult?.SearchResultItems) items.push(...pg.SearchResult.SearchResultItems)
  }
  const out: NormalizedJob[] = []
  const nowMs = Date.now()
  for (const item of items) {
    const md = item.MatchedObjectDescriptor
    if (!md?.PositionTitle) continue
    if (md.PositionEndDate) { const end = Date.parse(md.PositionEndDate); if (!isNaN(end) && end < nowMs) continue }
    const title = md.PositionTitle
    const dept = md.JobCategory?.[0]?.Name ?? md.DepartmentName ?? null
    if (!isHc(title, dept)) continue
    const loc = md.PositionLocation?.[0]
    if (!loc) continue
    const stateName = (loc.CountrySubDivisionCode ?? '').toLowerCase()
    const state = STATES[stateName] ?? null
    if (!state) continue
    const cityRaw = loc.CityName ?? ''
    const city = cityRaw.split(',')[0]?.trim() || null
    const sal = md.PositionRemuneration?.[0]
    const isUsdAnnual = sal?.RateIntervalCode === 'PA' && /year/i.test(sal?.Description ?? '')
    const salary_min = isUsdAnnual && sal?.MinimumRange ? Math.round(Number(sal.MinimumRange)) || null : null
    const salary_max = isUsdAnnual && sal?.MaximumRange ? Math.round(Number(sal.MaximumRange)) || null : null
    const id = String(item.MatchedObjectId)
    const details = md.UserArea?.Details ?? {}
    const sections: string[] = []
    if (details.JobSummary) sections.push(`<p>${details.JobSummary}</p>`)
    const majorDuties = Array.isArray(details.MajorDuties) ? details.MajorDuties : []
    if (majorDuties.length > 0) sections.push(`<h3>Major Duties</h3>${majorDuties.map((d) => `<p>${d}</p>`).join('')}`)
    if (details.Qualifications) sections.push(`<h3>Qualifications</h3>${details.Qualifications}`)
    if (details.Requirements) sections.push(`<h3>Requirements</h3>${details.Requirements}`)
    const keyReqs = Array.isArray(details.KeyRequirements) ? details.KeyRequirements : []
    if (keyReqs.length > 0) sections.push(`<h3>Key Requirements</h3><ul>${keyReqs.map((r) => `<li>${r}</li>`).join('')}</ul>`)
    if (details.Education) sections.push(`<h3>Education</h3>${details.Education}`)
    out.push({ slug: buildAtsSlug(title, 'usajobs', id), title, description: sections.join(''), apply_url: md.ApplyURI?.[0] ?? md.PositionURI ?? `https://www.usajobs.gov/job/${id}`, city, state, remote_hybrid: 'onsite', employment_type: 'full_time', salary_min, salary_max, source: 'usajobs:federal', external_ref: `usajobs:${id}` })
  }
  return { fetched: items.length, jobs: out }
}

async function fetchLever(slug: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, { headers: { Accept: 'application/json' }, timeoutMs: 10000 })
  if (!res.ok) throw new Error(`Lever ${slug}: ${res.status}`)
  const raw = await res.json() as Array<{ id: string; text: string; categories?: { location?: string; team?: string; commitment?: string; department?: string }; description?: string; descriptionPlain?: string; hostedUrl?: string; applyUrl?: string; workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string; interval?: string } }>
  const out: NormalizedJob[] = []
  for (const p of raw) {
    const dept = p.categories?.department ?? p.categories?.team ?? null
    if (!isHc(p.text, dept)) continue
    const loc = parseUsLocation(p.categories?.location)
    if (!loc.us) continue
    const commit = (p.categories?.commitment ?? 'Full-time').toLowerCase().replace(/\s+/g, '-')
    const remote = loc.remote || p.workplaceType === 'remote' ? 'remote' : p.workplaceType === 'hybrid' ? 'hybrid' : 'onsite'
    const sal = p.salaryRange ?? {}
    const isUsdAnnual = (!sal.currency || sal.currency === 'USD') && (!sal.interval || (/year/i.test(sal.interval) && !/half/i.test(sal.interval)))
    out.push({ slug: buildAtsSlug(p.text, 'lever', p.id), title: p.text, description: p.descriptionPlain || (p.description ?? '').replace(/<[^>]+>/g, '').trim(), apply_url: p.applyUrl ?? p.hostedUrl ?? `https://jobs.lever.co/${slug}/${p.id}`, city: loc.city, state: loc.state, remote_hybrid: remote, employment_type: COMMITMENT_MAP[commit] ?? 'full_time', salary_min: isUsdAnnual && typeof sal.min === 'number' ? sal.min : null, salary_max: isUsdAnnual && typeof sal.max === 'number' ? sal.max : null, source: `lever:${slug}`, external_ref: `lever:${slug}:${p.id}` })
  }
  return { fetched: raw.length, jobs: out }
}

Deno.serve(async (req: Request) => {
  // Cron-token gate (2026-05-28 audit): runs under the service role + only ingests public
  // job data, but was unauthenticated. Require the shared X-Cron-Token (same secret the
  // drip/bulk crons use). verify_jwt stays false; this header check IS the authorization.
  {
    const _exp = Deno.env.get('DRIP_SCHEDULER_TOKEN') ?? ''
    const _giv = req.headers.get('x-cron-token') ?? ''
    const _e = new TextEncoder(); const _a = _e.encode(_giv), _b = _e.encode(_exp)
    let _ok = _exp.length > 0 && _a.length === _b.length
    if (_ok) { let d = 0; for (let i = 0; i < _a.length; i++) d |= _a[i] ^ _b[i]; _ok = d === 0 }
    if (!_ok) return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
  const startedAt = Date.now()
  const CHUNK = 50
  const summary: Array<Record<string, unknown>> = []
  let grandFetched = 0, grandInserted = 0, grandUpdated = 0
  const errors: string[] = []
  const newSlugsToNotify: string[] = []
  const INDEXING_CAP_PER_TICK = 30
  let usaJobsKey: string | null = null
  try { const { data } = await supabase.rpc('get_vault_secret', { secret_name: 'usajobs_api_key' }); usaJobsKey = (data as string | null) || null } catch (e) { errors.push(`usajobs vault: ${e instanceof Error ? e.message : String(e)}`) }

  await Promise.all(SEED_BOARDS.map(async (cfg) => {
    const boardSummary: Record<string, unknown> = { provider: cfg.provider, boardSlug: cfg.boardSlug, companyName: cfg.companyName, fetched: 0, inserted: 0, updated: 0 }
    try {
      const sourceTag = cfg.provider === 'workday' ? `workday:${cfg.workday!.tenant}/${cfg.workday!.site}` : cfg.provider === 'usajobs' ? 'usajobs:federal' : `${cfg.provider}:${cfg.boardSlug}`
      const { data: existing, error: existingErr } = await supabase.rpc('get_ats_existing_refs_jsonb', { p_source: sourceTag })
      if (existingErr) boardSummary.existingRefsError = existingErr.message
      const existingRefs = new Set<string>()
      const existingSlugToRef = new Map<string, string>()
      for (const row of (existing ?? []) as Array<{ slug: string; external_ref: string }>) { existingRefs.add(row.external_ref); if (row.slug) existingSlugToRef.set(row.slug, row.external_ref) }
      boardSummary.existingRefs = existingRefs.size
      let r
      if (cfg.provider === 'workday') r = await fetchWorkday(cfg)
      else if (cfg.provider === 'usajobs') { if (!usaJobsKey) throw new Error('USAJobs API key not loaded from vault'); r = await fetchUSAJobs(usaJobsKey) }
      else r = cfg.provider === 'greenhouse' ? await fetchGreenhouse(cfg.boardSlug) : cfg.provider === 'ashby' ? await fetchAshby(cfg.boardSlug) : await fetchLever(cfg.boardSlug)
      boardSummary.fetched = r.fetched
      boardSummary.kept = r.jobs.length
      grandFetched += r.fetched
      const seenSlugs = new Set<string>()
      let droppedCrossRun = 0
      const dedupedJobs = r.jobs.filter((j) => { if (seenSlugs.has(j.slug)) return false; seenSlugs.add(j.slug); const dbExistingRef = existingSlugToRef.get(j.slug); if (dbExistingRef && dbExistingRef !== j.external_ref) { droppedCrossRun++; return false }; return true })
      boardSummary.dedupedFromSlug = r.jobs.length - dedupedJobs.length
      boardSummary.dedupedCrossRun = droppedCrossRun
      let boardNew = 0
      for (const j of dedupedJobs) { if (newSlugsToNotify.length >= INDEXING_CAP_PER_TICK) break; if (!existingRefs.has(j.external_ref)) { newSlugsToNotify.push(j.slug); boardNew += 1 } }
      boardSummary.indexingNewSlugs = boardNew
      for (let i = 0; i < dedupedJobs.length; i += CHUNK) {
        const chunk = dedupedJobs.slice(i, i + CHUNK)
        const { data, error } = await supabase.rpc('ats_import_upsert_jobs', { p_employer_slug: cfg.employerSlug, p_company_name: cfg.companyName, p_company_url: cfg.companyUrl, p_provider: cfg.provider, p_board_slug: cfg.boardSlug, p_jobs: chunk })
        if (error) { errors.push(`${cfg.boardSlug} chunk ${i / CHUNK + 1}: ${error.message}`); continue }
        const ins = (data?.inserted as number) ?? 0
        const upd = (data?.updated as number) ?? 0
        boardSummary.inserted = (boardSummary.inserted as number) + ins
        boardSummary.updated = (boardSummary.updated as number) + upd
        grandInserted += ins; grandUpdated += upd
      }
    } catch (e) { const msg = e instanceof Error ? e.message : String(e); errors.push(`${cfg.boardSlug}: ${msg}`); boardSummary.error = msg }
    summary.push(boardSummary)
  }))

  let matchRefresh: unknown = null
  try { const { data, error } = await supabase.rpc('refresh_marketplace_matches'); matchRefresh = error ? { error: error.message } : data } catch (e) { matchRefresh = { error: e instanceof Error ? e.message : String(e) } }

  let indexingPing: { ok: number; failed: number; attempted: number } = { ok: 0, failed: 0, attempted: 0 }
  if (newSlugsToNotify.length > 0) {
    const urls = newSlugsToNotify.map((s) => `https://freejobpost.co/jobs/${s}`)
    const result = await notifyGoogleIndexingApiBatch(urls, { concurrency: 5 })
    indexingPing = { ...result, attempted: urls.length }
  }

  const body = { ok: errors.length === 0, boards: summary, totals: { fetched: grandFetched, inserted: grandInserted, updated: grandUpdated }, matchRefresh, indexingPing, errors, duration_ms: Date.now() - startedAt }
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
