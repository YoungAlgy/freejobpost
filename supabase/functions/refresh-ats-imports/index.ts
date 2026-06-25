// refresh-ats-imports edge function
// =============================================================================
// Pulls every board in SEED_BOARDS, normalizes US + healthcare jobs, and
// upserts them into public_jobs via ats_import_upsert_jobs(). Designed to be
// invoked by pg_cron every 4 hours.
//
// v26 (2026-05-27): ENRICH_CAP=0 — skip per-job detail-fetch enrichment
//   entirely. The separate backfill-workday-descriptions cron (every 4hr
//   at :47) handles all description enrichment for thin rows. Removed
//   the second-heaviest source of wall-time (was 5-10s per Workday board).
//   This let us put Intermountain + Cigna back on without timing out.
//   Verified live: 19 boards complete in ~90s (was hitting 150s cap).
// v25 (2026-05-27): per-fetch AbortSignal timeouts (defense-in-depth).
// v24 (2026-05-27): per-fetch timeouts attempt (insufficient alone).
// v23 (2026-05-27): rolled back to 17 boards (no Intermountain/Cigna).
// v22-v20 (2026-05-27): various failed expansion attempts.
// v19 (2026-05-26): + Ochsner, Highmark, NYP.
// v18 (2026-05-26): + Banner Health.
// v15 (2026-05-17): switch existingRefs to the jsonb-returning variant
//   `get_ats_existing_refs_jsonb` to bypass PostgREST's default
//   db_max_rows=1000 cap on TABLE-returning RPCs. v14 was correctly
//   wired through an RPC but boardSummary.existingRefs topped out at
//   1000 for CCF (1,420 active) / AdventHealth (1,391) / MGB (1,086) /
//   USAJobs (2,361). jsonb returns as a single scalar so the row cap
//   doesn't apply.
// v14 (2026-05-17): route existingRefs pre-query through the new
//   `get_ats_existing_refs(p_source)` SECURITY DEFINER RPC. The prior
//   .from('public_jobs').select(...) was silently returning null because
//   service_role has no SELECT grant on public_jobs (only postgres /
//   authenticated / anon do). That made the v10-v13 "skip detail-fetch
//   for known jobs" + cross-run slug-dedup optimizations no-ops — every
//   cron tick re-fetched detail for the first 100 of each Workday board.
//   v14 closes that silent failure. Discovered during the 2026-05-17
//   backfill-workday-descriptions rollout when an analogous SELECT
//   surfaced the permission-denied error explicitly (the existingRefs
//   query swallowed it via `const { data: existing } = await ...` with
//   no `.error` destructure).
// v13 (2026-05-16): add identifying User-Agent header to Workday fetch sites.
//   Workday tenants throttle anonymous JSON-API traffic aggressively and
//   the 2026-05-16 maintenance-page incident (HTTP 303 → community.workday.com
//   /maintenance-page on all 6 of our tenants while unrelated tenants
//   like Kaiser returned HTTP 422) was a coordinated Saturday-morning
//   outage. Adding `User-Agent: freejobpost.co/aggregator (alex@avahealth.co)`
//   to listing + detail fetches gives Workday a way to identify our
//   traffic instead of lumping us with bot/scraper signatures, so future
//   throttling can be addressed via outreach rather than IP bans.
// v12 (2026-05-16): add USAJobs (federal healthcare jobs) as the 4th
//   provider. Pulls from data.usajobs.gov/api/Search filtered by Job
//   Category Codes 0601-0690 (medical/clinical series). API key lives
//   in Supabase vault (name 'usajobs_api_key') and is fetched via the
//   public.get_vault_secret SECURITY DEFINER RPC. Expected yield:
//   ~5,000 federal positions (VA, IHS, DoD military health, NIH, HHS).
// v11 (2026-05-16): cross-run slug-collision dedup. The slug pre-query
//   now runs for all providers (not just Workday) and returns slug→
//   external_ref map; jobs whose slug already exists in DB under a different
//   external_ref are dropped before upsert. Kills the intermittent MGB
//   public_jobs_slug_key errors that v10 still emitted.
// v10 (2026-05-16): re-introduce detail-fetch for NEW Workday jobs only,
//   parallelized at concurrency 10, capped at 100 per board. Adds ~5s of
//   wall time but gives new jobs full descriptions instead of 150-char
//   listing previews. Also adds slug-level dedup to eliminate the
//   intermittent public_jobs.slug unique-constraint violations.
// v9 (2026-05-16): drop per-item Workday detail-fetch. Listing endpoint
//   already returns title/externalPath/locationsText/jobDescription preview
//   — enough for a complete public_jobs row. Detail-fetch was sequential
//   (500ms × N) and triggered the 150s idle timeout on AdventHealth/CCF
//   when hundreds of jobs were newer than the last May-14 local seed. Deep
//   enrichment moves to the local run-ats-import.mjs script.
// v8 (2026-05-16): cap Workday listing at 30 pages (600 newest jobs).
//   Big tenants (CCF/AdventHealth/MGB each ~2000 jobs = ~100 pages) blew
//   the 150s edge cap even with parallel-5 batches. Cap covers many days
//   of new postings per 4h cron tick; deletes/full-refresh handled by
//   local run-ats-import.mjs script.
// v7 (2026-05-16): parallel pagination — fixes 504 on small Workday boards.
//   - .limit(2000) on existingRefs pre-query (was capped at 1000 default).
//   - Workday listing pagination fetches in parallel batches of 5.
//   - All 13 boards process concurrently via Promise.all.
//
// Auth: verify_jwt=false at the function level + X-Invoke-Secret header check.
// Matches the existing cron-edge-function pattern in this project (see
// run-drip-scheduler, process-bulk-send-queue, weekly-digest).
//
// Idempotent: re-running yields 0 net inserts on unchanged boards.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyGoogleIndexingApiBatch } from './_google-indexing.ts'

// v25: per-fetch timeout helper. Wraps fetch() with AbortSignal.timeout so
// a single hung request can't wedge the whole Promise.all batch.
function fetchWithTimeout(input: string | URL, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...rest } = init
  return fetch(input, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
}

// ── Seed boards (mirror of src/lib/ats-import/seed-boards.ts) ───────────────
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
  // Banner Health — ~1,050 jobs across AZ, CO, NE, NV, WY. Discovered via
  // careers landing redirect 2026-05-26. The wd108 host is unusual (most
  // Workday tenants use wd1/wd5/wd12) but verified live via the standard
  // /wday/cxs/{tenant}/{site}/jobs POST endpoint.
  { provider: 'workday', boardSlug: 'bannerhealth/Careers', companyName: 'Banner Health', companyUrl: 'https://www.bannerhealth.com', employerSlug: 'banner-health',
    workday: { tenantHost: 'bannerhealth.wd108.myworkdayjobs.com', tenant: 'bannerhealth', site: 'Careers', defaultState: 'AZ' } },
  // Ochsner Health — ~1,933 jobs, Louisiana-centered, expanding into Gulf
  // South. Discovered via careers.ochsner.org page-body URL scrape
  // 2026-05-26. Verified live: predominantly clinical roles (Med Tech,
  // RN, PA, etc.).
  { provider: 'workday', boardSlug: 'ochsner/Ochsner', companyName: 'Ochsner Health', companyUrl: 'https://www.ochsner.org', employerSlug: 'ochsner-health',
    workday: { tenantHost: 'ochsner.wd1.myworkdayjobs.com', tenant: 'ochsner', site: 'Ochsner', defaultState: 'LA' } },
  // Highmark Health (parent of Allegheny Health Network) — ~1,802 jobs
  // primarily in PA, NY, DE, WV. Discovered via ahn.org/careers redirect.
  // Mix of clinical (RN, Pharm Tech, Patient Care Tech) and insurance-arm
  // (Highmark BCBS / United Concordia) roles — HC_RE filter handles the
  // separation.
  { provider: 'workday', boardSlug: 'highmarkhealth/highmark', companyName: 'Highmark Health', companyUrl: 'https://www.highmarkhealth.org', employerSlug: 'highmark-health',
    workday: { tenantHost: 'highmarkhealth.wd1.myworkdayjobs.com', tenant: 'highmarkhealth', site: 'highmark', defaultState: 'PA' } },
  // NewYork-Presbyterian — ~364 jobs across Manhattan, Queens, Westchester.
  // Discovered via nyp.org/careers page-body scrape 2026-05-26.
  { provider: 'workday', boardSlug: 'nyp/nypcareers', companyName: 'NewYork-Presbyterian', companyUrl: 'https://www.nyp.org', employerSlug: 'newyork-presbyterian',
    workday: { tenantHost: 'nyp.wd1.myworkdayjobs.com', tenant: 'nyp', site: 'nypcareers', defaultState: 'NY' } },
  // v26 re-add: Intermountain Health + Cigna. Possible after dropping
  // the per-job detail-fetch enrichment (now handled exclusively by the
  // backfill-workday-descriptions cron).
  { provider: 'workday', boardSlug: 'imh/IntermountainCareers', companyName: 'Intermountain Health', companyUrl: 'https://intermountainhealthcare.org', employerSlug: 'intermountain-health',
    workday: { tenantHost: 'imh.wd108.myworkdayjobs.com', tenant: 'imh', site: 'IntermountainCareers', defaultState: 'UT' } },
  { provider: 'workday', boardSlug: 'cigna/cignacareers', companyName: 'Cigna', companyUrl: 'https://www.cigna.com', employerSlug: 'cigna',
    workday: { tenantHost: 'cigna.wd5.myworkdayjobs.com', tenant: 'cigna', site: 'cignacareers', defaultState: 'CT' } },
  // USAJobs: federal healthcare positions (VA, IHS, DoD military health, NIH, HHS).
  // Single logical board covering ~5,000 jobs across 40 Job Category Codes.
  { provider: 'usajobs', boardSlug: 'federal', companyName: 'U.S. Federal Government', companyUrl: 'https://www.usajobs.gov', employerSlug: 'us-federal-government' },
]

// Identifying header for Workday traffic — see v13 changelog above.
const WORKDAY_UA = 'freejobpost.co/aggregator (alex@avahealth.co)'

// ── Filters ──────────────────────────────────────────────────
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
  /\bsocial work/i, /\blcsw\b/i, /\blmft\b/i, /\blpc\b/i,
  /\boccupational therap/i, /\bphysical therap/i, /\bbcba\b/i,
  /\bpharmacist\b/i, /\bpharm(acy)? tech(nician)?\b/i,
  /\bsonographer\b/i, /\bradiologic\b/i,
  /\b(ct|mri|ultrasound|nuclear|mammography|sonography|imaging|cardiology|cardiac|echo|eeg|ekg|cath|vascular) (tech|technologist|technician)\b/i,
  /\b(medical|surgical|radiologic|laboratory|histology|cytology|sterile processing|orthopedic|orthopaedic) tech(nologist|nician)?\b/i,
  /\bmedical lab(oratory)? (tech|scientist)\b/i, /\bsterile processing\b/i,
  /\b(medical|surgical) assistant\b/i, /\bdental (hygienist|assistant)\b/i,
  /\bdietit?ian\b/i, /\brespiratory therap/i, /\bphlebotom/i, /\bcath lab\b/i,
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
        : provider === 'usajobs'
          ? `uj-${externalId}`
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

  // Listing pagination — first page sequential to get total, then parallel
  // batches of 5 for the rest. Workday rate-limits per-tenant but accepts
  // ~5 concurrent requests cleanly. Cuts CCF's 99-page traversal from
  // 99 × 1.66s = ~164s sequential to ~20 batches × 1.2s = ~24s wall time.
  const apiUrl = `https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}/jobs`
  const all: Array<{ title: string; externalPath: string; locationsText?: string; timeType?: string; remoteType?: string; jobDescription?: string }> = []
  const PAGE = 20
  const PARALLEL = 5
  const MAX_JOBS = 10000
  // Cap pagination at 30 pages (600 newest jobs). Big Workday tenants
  // (CCF, AdventHealth, MGB each ~2000 jobs = ~100 pages) blew the 150s
  // edge cap even with parallel-5 batches. Workday lists newest-first by
  // default, and the cron runs every 4h — 600 jobs covers many days of
  // new postings even at the busiest hospitals. Initial seed + full
  // refresh runs via the local run-ats-import.mjs Node script (no time
  // limit).
  const MAX_LISTING_PAGES = 30

  async function fetchPage(offset: number) {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': WORKDAY_UA,
      },
      body: JSON.stringify({ limit: PAGE, offset, searchText: '', appliedFacets: {} }),
    })
    if (!r.ok) throw new Error(`Workday ${wd.tenant} listing ${offset}: ${r.status}`)
    return await r.json() as { total: number; jobPostings?: typeof all }
  }

  const first = await fetchPage(0)
  all.push(...(first.jobPostings ?? []))
  const total = Math.min(first.total ?? 0, MAX_JOBS)

  const offsets: number[] = []
  const pageCap = Math.min(total, PAGE * MAX_LISTING_PAGES)
  for (let o = PAGE; o < pageCap; o += PAGE) offsets.push(o)
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const batch = offsets.slice(i, i + PARALLEL)
    const pages = await Promise.all(batch.map((o) => fetchPage(o).catch(() => ({ total: 0, jobPostings: [] }))))
    for (const p of pages) all.push(...(p.jobPostings ?? []))
    if (all.length >= MAX_JOBS) break
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

  // v26: NO ENRICHMENT in this function. backfill-workday-descriptions
  // cron (every 4hr at :47) picks up thin descriptions in dedicated
  // invocations. Removes 5-10s of wall time per Workday board and let
  // us re-add Intermountain + Cigna without timing out.
  const healthcare = all.filter((item) => isHc(item.title, null))

  const out: NormalizedJob[] = []
  for (const item of healthcare) {
    const externalRef = `workday:${wd.tenant}/${wd.site}:${item.externalPath}`
    const description = htmlToText(item.jobDescription ?? '')
    const state = findStateInText(item.locationsText, wd.defaultState)
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

async function fetchUSAJobs(apiKey: string): Promise<{ fetched: number; jobs: NormalizedJob[] }> {
  // Federal healthcare job category codes (US OPM series 0601-0690).
  // Curated list covers medical officers, nurses, allied health, dental,
  // pharmacy, public health, and health system administration roles.
  const HC_CODES = [
    '0601', '0602', '0603', '0610', '0620', '0630', '0631', '0633', '0635', '0636',
    '0637', '0638', '0644', '0645', '0646', '0647', '0648', '0649', '0650', '0651',
    '0660', '0661', '0662', '0664', '0665', '0667', '0668', '0669', '0670', '0671',
    '0672', '0675', '0679', '0680', '0681', '0682', '0683', '0685', '0688', '0690',
  ].join(';')
  const RESULTS_PER_PAGE = 500
  const MAX_PAGES = 20

  async function fetchPage(page: number) {
    const url = `https://data.usajobs.gov/api/Search?JobCategoryCode=${HC_CODES}&ResultsPerPage=${RESULTS_PER_PAGE}&Page=${page}`
    const r = await fetch(url, {
      headers: {
        Host: 'data.usajobs.gov',
        'User-Agent': 'alex@avahealth.co',
        'Authorization-Key': apiKey,
        Accept: 'application/json',
      },
    })
    if (!r.ok) throw new Error(`USAJobs page ${page}: ${r.status}`)
    return await r.json() as {
      SearchResult: {
        SearchResultCountAll?: number
        SearchResultItems?: Array<{
          MatchedObjectId: string
          MatchedObjectDescriptor?: {
            PositionTitle?: string
            PositionURI?: string
            ApplyURI?: string[]
            OrganizationName?: string
            DepartmentName?: string
            PositionLocation?: Array<{ CityName?: string; CountrySubDivisionCode?: string; LocationName?: string }>
            JobCategory?: Array<{ Name?: string; Code?: string }>
            PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string; Description?: string }>
            PositionEndDate?: string
            // The USAJobs Search API returns these additional rich fields
            // under UserArea.Details. JobSummary alone is typically 50-300
            // chars (too short for Google for Jobs eligibility past our
            // 250-char floor). MajorDuties + Qualifications add ~1000-3000
            // chars each — concatenating them yields a real job description
            // suitable for both on-site rendering and structured-data feeds.
            UserArea?: {
              Details?: {
                JobSummary?: string
                MajorDuties?: string[]
                Qualifications?: string
                Requirements?: string
                KeyRequirements?: string[]
                Education?: string
                Evaluations?: string
              }
            }
          }
        }>
      }
    }
  }

  const first = await fetchPage(1)
  const items = [...(first.SearchResult.SearchResultItems ?? [])]
  const total = first.SearchResult.SearchResultCountAll ?? 0
  const totalPages = Math.min(MAX_PAGES, Math.ceil(total / RESULTS_PER_PAGE))

  // Parallel-fetch remaining pages, batches of 3 (USAJobs rate-limits more
  // aggressively than Workday — keep concurrency low).
  const PARALLEL = 3
  const remaining: number[] = []
  for (let p = 2; p <= totalPages; p++) remaining.push(p)
  for (let i = 0; i < remaining.length; i += PARALLEL) {
    const batch = remaining.slice(i, i + PARALLEL)
    const pages = await Promise.all(
      batch.map((p) => fetchPage(p).catch(() => null)),
    )
    for (const pg of pages) {
      if (pg?.SearchResult?.SearchResultItems) items.push(...pg.SearchResult.SearchResultItems)
    }
  }

  const out: NormalizedJob[] = []
  const nowMs = Date.now()
  for (const item of items) {
    const md = item.MatchedObjectDescriptor
    if (!md?.PositionTitle) continue

    // Skip jobs whose application window has already closed
    if (md.PositionEndDate) {
      const end = Date.parse(md.PositionEndDate)
      if (!isNaN(end) && end < nowMs) continue
    }

    const title = md.PositionTitle
    const dept = md.JobCategory?.[0]?.Name ?? md.DepartmentName ?? null
    // Defensive isHc check — server-side JobCategoryCode filter should
    // already enforce healthcare-only, but keep both layers for safety.
    if (!isHc(title, dept)) continue

    const loc = md.PositionLocation?.[0]
    if (!loc) continue
    const stateName = (loc.CountrySubDivisionCode ?? '').toLowerCase()
    const state = STATES[stateName] ?? null
    if (!state) continue  // skip non-US (territories etc.)
    const cityRaw = loc.CityName ?? ''
    const city = cityRaw.split(',')[0]?.trim() || null

    const sal = md.PositionRemuneration?.[0]
    const isUsdAnnual = sal?.RateIntervalCode === 'PA' && /year/i.test(sal?.Description ?? '')
    const salary_min = isUsdAnnual && sal?.MinimumRange ? Math.round(Number(sal.MinimumRange)) || null : null
    const salary_max = isUsdAnnual && sal?.MaximumRange ? Math.round(Number(sal.MaximumRange)) || null : null

    const id = String(item.MatchedObjectId)

    // Build a full-bodied description by concatenating the rich fields
    // USAJobs returns in the Search response (MajorDuties + Qualifications
    // + Requirements + JobSummary). Pre-2026-05-25 we only used JobSummary,
    // which was typically 50-300 chars and silently failed our 250-char
    // partner-feed filter for ~424 federal jobs. The concatenated form
    // averages ~1500-3500 chars and gets these high-value federal roles
    // back into Google for Jobs + every partner feed.
    const details = md.UserArea?.Details ?? {}
    const sections: string[] = []
    if (details.JobSummary) {
      sections.push(`<p>${details.JobSummary}</p>`)
    }
    const majorDuties = Array.isArray(details.MajorDuties) ? details.MajorDuties : []
    if (majorDuties.length > 0) {
      sections.push(
        `<h3>Major Duties</h3>${majorDuties.map((d) => `<p>${d}</p>`).join('')}`
      )
    }
    if (details.Qualifications) {
      sections.push(`<h3>Qualifications</h3>${details.Qualifications}`)
    }
    if (details.Requirements) {
      sections.push(`<h3>Requirements</h3>${details.Requirements}`)
    }
    const keyReqs = Array.isArray(details.KeyRequirements) ? details.KeyRequirements : []
    if (keyReqs.length > 0) {
      sections.push(
        `<h3>Key Requirements</h3><ul>${keyReqs.map((r) => `<li>${r}</li>`).join('')}</ul>`
      )
    }
    if (details.Education) {
      sections.push(`<h3>Education</h3>${details.Education}`)
    }
    const fullDescription = sections.join('')

    out.push({
      slug: buildAtsSlug(title, 'usajobs', id),
      title,
      description: fullDescription,
      apply_url: md.ApplyURI?.[0] ?? md.PositionURI ?? `https://www.usajobs.gov/job/${id}`,
      city, state,
      remote_hybrid: 'onsite',
      employment_type: 'full_time',
      salary_min, salary_max,
      source: 'usajobs:federal',
      external_ref: `usajobs:${id}`,
    })
  }
  return { fetched: items.length, jobs: out }
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
    // Annual USD only (public_jobs is annual USD). Lever's annual interval is
    // 'per-year-salary'; reject hourly/weekly/monthly/quarterly/half-yearly, which
    // would be mis-stated as annual. 'per-half-year-salary' contains "year" + "salary",
    // so the 'half' guard is required (mirrors src/lib/ats-import/lever.ts normalizeSalary).
    const interval = (sal.interval ?? '').toLowerCase()
    const isUsdAnnual = (!sal.currency || sal.currency === 'USD') &&
                        (!interval || (interval.includes('year') && !interval.includes('half')))
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

// ── HTTP handler ───────────────────────────────────────────────
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

  // Slugs that are NEW this cron tick (i.e. external_ref not in
  // existingRefs before the upsert). Collected across all boards then
  // batch-notified to Google's Indexing API at the end of the run.
  // Caps at INDEXING_CAP per cron tick because Google's default quota is
  // 200 URL notifications per project per day — we run 6 cycles/day, so
  // ~30 new slugs per cycle keeps us under the cap with headroom.
  const newSlugsToNotify: string[] = []
  const INDEXING_CAP_PER_TICK = 30

  // Fetch USAJobs API key once from Supabase vault (SECURITY DEFINER RPC,
  // service-role only). Cached across all USAJobs board fetches in this run.
  let usaJobsKey: string | null = null
  try {
    const { data } = await supabase.rpc('get_vault_secret', { secret_name: 'usajobs_api_key' })
    usaJobsKey = (data as string | null) || null
  } catch (e) {
    errors.push(`usajobs vault: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Run all boards in parallel — Workday boards (the slow ones with 1968-job
  // listings) overlap with each other and with the fast Greenhouse/Lever/Ashby
  // boards. Wall time drops from sequential O(sum) to max(per-board) ~25s.
  await Promise.all(SEED_BOARDS.map(async (cfg) => {
    const boardSummary: Record<string, unknown> = {
      provider: cfg.provider, boardSlug: cfg.boardSlug, companyName: cfg.companyName,
      fetched: 0, inserted: 0, updated: 0,
    }
    try {
      // v15: pre-query existing rows for THIS source via the
      // `get_ats_existing_refs_jsonb` SECURITY DEFINER RPC. We can't query
      // public_jobs directly because service_role has no grant; the RPC
      // runs as postgres and is scoped to a single source. Used for
      // (a) skip-detail-fetch for known Workday jobs and (b) cross-run
      // slug-collision dedup across all providers. The jsonb variant
      // bypasses the PostgREST default 1000-row cap that bit v14 on the
      // larger sources (CCF / AdventHealth / MGB / USAJobs).
      const sourceTag = cfg.provider === 'workday'
        ? `workday:${cfg.workday!.tenant}/${cfg.workday!.site}`
        : cfg.provider === 'usajobs'
          ? 'usajobs:federal'
          : `${cfg.provider}:${cfg.boardSlug}`
      const { data: existing, error: existingErr } = await supabase
        .rpc('get_ats_existing_refs_jsonb', { p_source: sourceTag })
      if (existingErr) {
        // Don't swallow it like v10-v13 did — surface in the per-board
        // summary so future grant/RPC drift is visible in the response.
        boardSummary.existingRefsError = existingErr.message
      }
      const existingRefs = new Set<string>()
      const existingSlugToRef = new Map<string, string>()
      for (const row of (existing ?? []) as Array<{ slug: string; external_ref: string }>) {
        existingRefs.add(row.external_ref)
        if (row.slug) existingSlugToRef.set(row.slug, row.external_ref)
      }
      boardSummary.existingRefs = existingRefs.size

      let r
      if (cfg.provider === 'workday') {
        r = await fetchWorkday(cfg, existingRefs)
      } else if (cfg.provider === 'usajobs') {
        if (!usaJobsKey) throw new Error('USAJobs API key not loaded from vault')
        r = await fetchUSAJobs(usaJobsKey)
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
      // v11: two-layer slug dedup before chunking:
      //   1. Within-run: drop second-occurrence dups in the fetched batch.
      //   2. Cross-run: drop new jobs whose slug already exists in the DB
      //      under a different external_ref. The upsert RPC ON CONFLICT
      //      keys on external_ref, so it can't gracefully handle slug-only
      //      collisions and falls back to a unique-constraint error.
      const seenSlugs = new Set<string>()
      let droppedCrossRun = 0
      const dedupedJobs = r.jobs.filter((j) => {
        if (seenSlugs.has(j.slug)) return false
        seenSlugs.add(j.slug)
        const dbExistingRef = existingSlugToRef.get(j.slug)
        if (dbExistingRef && dbExistingRef !== j.external_ref) {
          droppedCrossRun++
          return false
        }
        return true
      })
      boardSummary.dedupedFromSlug = r.jobs.length - dedupedJobs.length
      boardSummary.dedupedCrossRun = droppedCrossRun

      // Collect new-slug list for the Indexing API ping at the end of
      // the run. "New" = external_ref not in the pre-query existingRefs
      // Set, which is the same logic the upsert RPC uses to decide
      // inserted vs updated. Capped globally per cron tick so the
      // Indexing API quota stays in budget.
      let boardNew = 0
      for (const j of dedupedJobs) {
        if (newSlugsToNotify.length >= INDEXING_CAP_PER_TICK) break
        if (!existingRefs.has(j.external_ref)) {
          newSlugsToNotify.push(j.slug)
          boardNew += 1
        }
      }
      boardSummary.indexingNewSlugs = boardNew

      for (let i = 0; i < dedupedJobs.length; i += CHUNK) {
        const chunk = dedupedJobs.slice(i, i + CHUNK)
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
  }))

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

  // Google Indexing API ping for newly-inserted jobs — drops Google for
  // Jobs discovery latency from ~24h (sitemap crawl) to ~15min. No-op
  // when GOOGLE_SERVICE_ACCOUNT_JSON env var is unset, so this is safe
  // to ship before the GCP setup is complete (matches the pattern used
  // by the Next.js side in src/app/post-job/verify/[token]/page.tsx).
  // Concurrency 5 keeps wall time bounded (~6s for the 30-job cap).
  let indexingPing: { ok: number; failed: number; attempted: number } = {
    ok: 0, failed: 0, attempted: 0,
  }
  if (newSlugsToNotify.length > 0) {
    const urls = newSlugsToNotify.map((s) => `https://freejobpost.co/jobs/${s}`)
    const result = await notifyGoogleIndexingApiBatch(urls, { concurrency: 5 })
    indexingPing = { ...result, attempted: urls.length }
  }

  const body = {
    ok: errors.length === 0,
    boards: summary,
    totals: { fetched: grandFetched, inserted: grandInserted, updated: grandUpdated },
    matchRefresh,
    indexingPing,
    errors,
    duration_ms: Date.now() - startedAt,
  }
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
