#!/usr/bin/env node
// One-shot ATS import runner.
//
// Reads .env.local for SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL,
// fetches each board in scripts/generate-ats-import-sql.mjs' SEED_BOARDS,
// normalizes the jobs, and pushes them through public.ats_import_upsert_jobs()
// in chunks of 50. Reports inserted/updated per board.
//
// Run with:  node scripts/run-ats-import.mjs
//
// This script duplicates the fetch+normalize logic from the canonical lib
// (src/lib/ats-import/*) so it can run without a TS build step. Same call
// path as a future cron edge function will use.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ── Load .env.local ────────────────────────────────────────────────────
const envText = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const k = trimmed.slice(0, eq).trim()
  // Strip:  surrounding quotes, literal "\n" suffix (PS editor artifact),
  // any actual whitespace at the ends.
  let v = trimmed.slice(eq + 1).trim()
  v = v.replace(/^["']|["']$/g, '')        // outer quotes
  v = v.replace(/\\n$/, '')                 // literal backslash-n suffix
  v = v.replace(/\\r$/, '')                 // literal backslash-r suffix
  v = v.trim()
  env[k] = v
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── State + healthcare filters + HTML decode (same as generator) ──────
const STATES = {
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

function parseUsLocation(raw) {
  const s = (raw ?? '').trim()
  if (!s) return { us: false, city: null, state: null, remote: false }
  if (/^remote$|^anywhere$|\(remote\)$/i.test(s) || /remote\s*[-,–]\s*us/i.test(s)) {
    return { us: true, city: null, state: null, remote: true }
  }
  if (/\b(india|tokyo|japan|johannesburg|south africa|london|uk|united kingdom|canada|berlin|germany|brazil|mexico|spain|france|ireland|singapore|amsterdam|sydney|australia|emea|apac|latam|philippines|toronto)\b/i.test(s)) {
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
  /\blpn\b/i, /\bnurse practitioner\b/i, /\bcrna\b/i, /\bphysician assistant\b/i,
  /\btherapist\b/i, /\bcounsel(or|lor)\b/i, /\bpsychiatrist\b/i, /\bpsychologist\b/i,
  /\bsocial work\b/i, /\blcsw\b/i, /\blmft\b/i, /\blpc\b/i, /\bbcba\b/i,
  /\bpharmacist\b/i, /\bsonographer\b/i, /\brad(iologic)? tech\b/i,
  /\bmri tech\b/i, /\bct tech\b/i, /\b(medical|surgical) (assistant|tech)/i,
  /\bdental (hygienist|assistant)\b/i, /\bdietit?ian\b/i,
  /\brespiratory therap\b/i, /\bphlebotom\b/i, /\bsleep tech\b/i, /\bcath lab\b/i,
  /\bemt\b/i, /\bparamedic\b/i,
  /\bcare (manager|coordinator|navigator)\b/i, /\bcase manager\b/i,
  /\bclinical (operations|manager|director|supervisor|coordinator|reviewer)\b/i,
  /\butilization (management|review)\b/i,
  /\bmedical (coder|biller|coding|billing)\b/i, /\bhealth ?coach\b/i,
  /\bbehavioral health\b/i, /\bmental health\b/i,
  /\bpatient (care|services|advocate|navigator|access)\b/i,
  /\b(clinic|hospital|hospice|home health)\b/i,
]
const isHc = (title, dept) => HC_RE.some((re) => re.test(`${title} ${dept ?? ''}`))

function htmlToText(html) {
  if (!html) return ''
  const decode = (str) => str
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

function buildAtsSlug(title, provider, externalId) {
  const ts = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  const id = provider === 'greenhouse'
    ? `gh-${externalId}`
    : provider === 'ashby'
      ? `ab-${String(externalId).slice(0, 8)}`
      : provider === 'workday'
        ? `wd-${externalId}`  // pass the actual unique Workday job ID, not a slice
        : `lv-${String(externalId).slice(0, 8)}`
  return `${ts || 'job'}-${id}`
}

const COMMITMENT_MAP = {
  'full-time': 'full_time', fulltime: 'full_time',
  'part-time': 'part_time', parttime: 'part_time',
  contract: 'contract', contractor: 'contract', temporary: 'contract',
  'per-diem': 'per_diem', perdiem: 'per_diem',
  intern: 'internship', internship: 'internship',
}

// ── Fetchers ─────────────────────────────────────────────────────────
async function fetchGreenhouse(token) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`GH ${token}: ${res.status}`)
  const { jobs: raw = [] } = await res.json()
  const out = []
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

async function fetchAshby(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Ashby ${slug}: ${res.status}`)
  const { jobs: raw = [] } = await res.json()
  const out = []
  for (const j of raw) {
    const dept = j.department ?? j.team ?? null
    if (!isHc(j.title, dept)) continue
    const region = j.address?.postalAddress?.addressRegion
    const locality = j.address?.postalAddress?.addressLocality
    const locInput = region ? (locality ? `${locality}, ${region}` : region) : j.location ?? ''
    const loc = parseUsLocation(locInput)
    if (!loc.us) continue
    const isRemote = loc.remote || j.isRemote === true || j.workplaceType === 'Remote'
    const remote = isRemote ? 'remote' : j.workplaceType === 'Hybrid' ? 'hybrid' : 'onsite'
    const empMap = { FullTime: 'full_time', PartTime: 'part_time', Contract: 'contract', Contractor: 'contract', Intern: 'internship' }
    out.push({
      slug: buildAtsSlug(j.title, 'ashby', j.id),
      title: j.title,
      description: j.descriptionPlain || (j.descriptionHtml ? htmlToText(j.descriptionHtml) : ''),
      apply_url: j.applyUrl ?? j.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${j.id}`,
      city: loc.city, state: loc.state,
      remote_hybrid: remote,
      employment_type: empMap[j.employmentType] ?? 'full_time',
      salary_min: null, salary_max: null,
      source: `ashby:${slug}`,
      external_ref: `ashby:${slug}:${j.id}`,
    })
  }
  return { fetched: raw.length, jobs: out }
}

async function fetchWorkday(cfg, existingRefs) {
  const TIME_MAP = { 'Full time': 'full_time', 'Part time': 'part_time', 'Per Diem': 'per_diem', 'Per diem': 'per_diem', 'Contractor': 'contract', 'Contract': 'contract', 'Temporary': 'contract', 'Intern': 'internship' }
  const REMOTE_MAP = { 'Fully Remote': 'remote', 'Remote': 'remote', 'On-site': 'onsite', 'Onsite': 'onsite', 'Hybrid': 'hybrid' }
  const STATE_NAMES = {
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
  }
  function parseLoc(locText, detailLoc, fallback) {
    const candidates = [detailLoc, locText].filter(Boolean)
    for (const raw of candidates) {
      const p = parseUsLocation(raw)
      if (p.us && p.state) return { city: p.city, state: p.state, remote: p.remote }
    }
    const lower = (locText || '').toLowerCase()
    for (const [n, abbr] of Object.entries(STATE_NAMES)) {
      if (lower.includes(n)) return { city: null, state: abbr, remote: false }
    }
    return { city: null, state: fallback, remote: false }
  }

  const wd = cfg.workday
  const apiUrl = `https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}/jobs`
  const all = []
  const PAGE = 20
  let offset = 0, total = -1
  while (total === -1 || offset < total) {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ limit: PAGE, offset, searchText: '', appliedFacets: {} }),
    })
    if (!r.ok) throw new Error(`Workday ${wd.tenant} offset=${offset}: ${r.status}`)
    const data = await r.json()
    all.push(...(data.jobPostings ?? []))
    if (total === -1) total = data.total
    offset += PAGE
    if (all.length >= 10000) break
  }
  console.log(`    listings pulled: ${all.length}`)

  const out = []
  let enriched = 0, shallow = 0
  for (const item of all) {
    if (!isHc(item.title, null)) continue
    const externalRef = `workday:${wd.tenant}/${wd.site}:${item.externalPath}`
    const needsEnrich = !existingRefs.has(externalRef)

    let description = htmlToText(item.jobDescription ?? '')
    let detailLoc
    if (needsEnrich) {
      try {
        const detailUrl = `https://${wd.tenantHost}/wday/cxs/${wd.tenant}/${wd.site}${item.externalPath}`
        const dr = await fetch(detailUrl, { headers: { Accept: 'application/json' } })
        if (dr.ok) {
          const dd = await dr.json()
          const info = dd?.jobPostingInfo
          if (info) {
            description = htmlToText(info.jobDescription ?? '') || description
            detailLoc = info.location
          }
        }
        enriched++
      } catch {}
    } else {
      shallow++
    }

    const parsed = parseLoc(item.locationsText, detailLoc, wd.defaultState)
    const remote_hybrid = REMOTE_MAP[item.remoteType ?? ''] ?? (parsed.remote ? 'remote' : 'onsite')

    // Extract the unique Workday job ID from the externalPath. Pattern is
    // /job/{facility}/{title-slug}_{jobId} where jobId is unique per tenant.
    // Fall back to the last 20 alphanumeric chars if no underscore found.
    const pathClean = item.externalPath.replace(/[^a-z0-9_-]+/gi, '')
    const jobId = pathClean.match(/_([^_]+)$/)?.[1] ?? pathClean.slice(-20)
    out.push({
      slug: buildAtsSlug(item.title, 'workday', jobId),
      title: item.title,
      description,
      apply_url: `https://${wd.tenantHost}/${wd.site}${item.externalPath}`,
      city: parsed.city, state: parsed.state, remote_hybrid,
      employment_type: TIME_MAP[item.timeType ?? ''] ?? 'full_time',
      salary_min: null, salary_max: null,
      source: `workday:${wd.tenant}/${wd.site}`,
      external_ref: externalRef,
    })
  }
  console.log(`    enriched(new)=${enriched}  shallow(existing)=${shallow}`)
  // Dedupe by external_ref — Workday occasionally returns the same job under
  // multiple listing rows (e.g. when locationsText = "2 Locations" the API
  // may emit duplicate jobPostings). Postgres ON CONFLICT can't update the
  // same row twice within one statement, so any duplicate in a chunk poisons
  // the whole chunk.
  const seen = new Set()
  const deduped = []
  for (const job of out) {
    if (seen.has(job.external_ref)) continue
    seen.add(job.external_ref)
    deduped.push(job)
  }
  if (deduped.length !== out.length) {
    console.log(`    deduped ${out.length - deduped.length} duplicate external_refs`)
  }
  return { fetched: all.length, jobs: deduped }
}

async function fetchLever(slug) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Lever ${slug}: ${res.status}`)
  const raw = await res.json()
  const out = []
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

// ── Seed boards (mirror of src/lib/ats-import/seed-boards.ts) ─────────
const SEED_BOARDS = [
  { provider: 'greenhouse', boardSlug: 'oscar',         companyName: 'Oscar Health',   companyUrl: 'https://www.hioscar.com',       employerSlug: 'oscar-health'    },
  { provider: 'greenhouse', boardSlug: 'onemedical',    companyName: 'One Medical',    companyUrl: 'https://www.onemedical.com',    employerSlug: 'one-medical'     },
  { provider: 'greenhouse', boardSlug: 'tia',           companyName: 'Tia',            companyUrl: 'https://www.asktia.com',         employerSlug: 'tia'             },
  { provider: 'greenhouse', boardSlug: 'bicyclehealth', companyName: 'Bicycle Health', companyUrl: 'https://www.bicyclehealth.com', employerSlug: 'bicycle-health'  },
  { provider: 'lever',      boardSlug: 'lyrahealth',    companyName: 'Lyra Health',    companyUrl: 'https://www.lyrahealth.com',    employerSlug: 'lyra-health'     },
  { provider: 'ashby',      boardSlug: 'talkiatry',     companyName: 'Talkiatry',      companyUrl: 'https://www.talkiatry.com',     employerSlug: 'talkiatry'       },
  { provider: 'ashby',      boardSlug: 'headway',       companyName: 'Headway',        companyUrl: 'https://www.headway.co',        employerSlug: 'headway'         },
  // Workday boards — heavier (paginated listings + per-job detail fetch for new jobs)
  { provider: 'workday', boardSlug: 'ccf/ClevelandClinicCareers', companyName: 'Cleveland Clinic', companyUrl: 'https://my.clevelandclinic.org', employerSlug: 'cleveland-clinic',
    workday: { tenantHost: 'ccf.wd1.myworkdayjobs.com', tenant: 'ccf', site: 'ClevelandClinicCareers', defaultState: 'OH' } },
  { provider: 'workday', boardSlug: 'adventhealth/AH_External_Career_Site', companyName: 'AdventHealth', companyUrl: 'https://www.adventhealth.com', employerSlug: 'adventhealth',
    workday: { tenantHost: 'adventhealth.wd12.myworkdayjobs.com', tenant: 'adventhealth', site: 'AH_External_Career_Site', defaultState: 'FL' } },
  { provider: 'workday', boardSlug: 'stanfordhealthcare/SHC_External_Career_Site', companyName: 'Stanford Health Care', companyUrl: 'https://stanfordhealthcare.org', employerSlug: 'stanford-health-care',
    workday: { tenantHost: 'stanfordhealthcare.wd5.myworkdayjobs.com', tenant: 'stanfordhealthcare', site: 'SHC_External_Career_Site', defaultState: 'CA' } },
  { provider: 'workday', boardSlug: 'massgeneralbrigham/MGBExternal', companyName: 'Mass General Brigham', companyUrl: 'https://www.massgeneralbrigham.org', employerSlug: 'mass-general-brigham',
    workday: { tenantHost: 'massgeneralbrigham.wd1.myworkdayjobs.com', tenant: 'massgeneralbrigham', site: 'MGBExternal', defaultState: 'MA' } },
  { provider: 'workday', boardSlug: 'saintlukes/saintlukeshealthcareers', companyName: 'Saint Luke\'s Healthcare', companyUrl: 'https://www.saintlukeskc.org', employerSlug: 'saint-lukes-healthcare',
    workday: { tenantHost: 'saintlukes.wd1.myworkdayjobs.com', tenant: 'saintlukes', site: 'saintlukeshealthcareers', defaultState: 'MO' } },
  { provider: 'workday', boardSlug: 'elevancehealth/ANT', companyName: 'Elevance Health', companyUrl: 'https://www.elevancehealth.com', employerSlug: 'elevance-health',
    workday: { tenantHost: 'elevancehealth.wd1.myworkdayjobs.com', tenant: 'elevancehealth', site: 'ANT', defaultState: 'IN' } },
]

// ── Main loop ─────────────────────────────────────────────────────────
const CHUNK = 50
let grand = { fetched: 0, inserted: 0, updated: 0, errors: [] }
for (const cfg of SEED_BOARDS) {
  console.log(`\n=== ${cfg.companyName} (${cfg.provider}:${cfg.boardSlug}) ===`)
  let r
  try {
    if (cfg.provider === 'workday') {
      // Pre-query existing external_refs for this Workday board so we only
      // enrich (detail-fetch) the NEW jobs. Massively cheaper than a full
      // re-enrich on every run.
      const sourceTag = `workday:${cfg.workday.tenant}/${cfg.workday.site}`
      const { data: existing } = await supabase
        .from('public_jobs')
        .select('external_ref')
        .eq('source', sourceTag)
        .not('external_ref', 'is', null)
      const existingRefs = new Set((existing ?? []).map((row) => row.external_ref).filter(Boolean))
      console.log(`  Pre-query: ${existingRefs.size} existing refs for ${sourceTag}`)
      r = await fetchWorkday(cfg, existingRefs)
    } else {
      r = cfg.provider === 'greenhouse'
        ? await fetchGreenhouse(cfg.boardSlug)
        : cfg.provider === 'ashby'
          ? await fetchAshby(cfg.boardSlug)
          : await fetchLever(cfg.boardSlug)
    }
  } catch (e) {
    console.error(`  FETCH FAILED: ${e.message}`)
    grand.errors.push(`${cfg.boardSlug}: ${e.message}`)
    continue
  }
  console.log(`  Fetched ${r.fetched}, kept ${r.jobs.length} (US healthcare)`)
  grand.fetched += r.fetched

  for (let i = 0; i < r.jobs.length; i += CHUNK) {
    const chunk = r.jobs.slice(i, i + CHUNK)
    const rpcRes = await supabase.rpc('ats_import_upsert_jobs', {
      p_employer_slug: cfg.employerSlug,
      p_company_name:  cfg.companyName,
      p_company_url:   cfg.companyUrl,
      p_provider:      cfg.provider,
      p_board_slug:    cfg.boardSlug,
      p_jobs:          chunk,
    })
    const { data, error } = rpcRes
    if (error) {
      console.error(`  CHUNK ${i}-${i + chunk.length} FAILED:`, JSON.stringify(error))
      grand.errors.push(`${cfg.boardSlug} chunk ${i}: ${error.message ?? JSON.stringify(error)}`)
      continue
    }
    if (i === 0) console.log(`  Raw data sample:`, JSON.stringify(data))
    const ins = data?.inserted ?? 0
    const upd = data?.updated ?? 0
    console.log(`  Chunk ${i / CHUNK + 1}: inserted ${ins}, updated ${upd}`)
    grand.inserted += ins
    grand.updated += upd
  }
}

console.log('\n========================================')
console.log(`TOTAL: fetched ${grand.fetched}  inserted ${grand.inserted}  updated ${grand.updated}`)
if (grand.errors.length) {
  console.log(`Errors: ${grand.errors.length}`)
  grand.errors.forEach((e) => console.log(`  - ${e}`))
}
console.log('========================================')
