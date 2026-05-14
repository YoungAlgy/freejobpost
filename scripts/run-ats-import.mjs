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
  const id = provider === 'greenhouse' ? `gh-${externalId}` : `lv-${String(externalId).slice(0, 8)}`
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
  { provider: 'greenhouse', boardSlug: 'oscar',      companyName: 'Oscar Health', companyUrl: 'https://www.hioscar.com',      employerSlug: 'oscar-health' },
  { provider: 'lever',      boardSlug: 'lyrahealth', companyName: 'Lyra Health',  companyUrl: 'https://www.lyrahealth.com',   employerSlug: 'lyra-health'  },
]

// ── Main loop ─────────────────────────────────────────────────────────
const CHUNK = 50
let grand = { fetched: 0, inserted: 0, updated: 0, errors: [] }
for (const cfg of SEED_BOARDS) {
  console.log(`\n=== ${cfg.companyName} (${cfg.provider}:${cfg.boardSlug}) ===`)
  let r
  try {
    r = cfg.provider === 'greenhouse'
      ? await fetchGreenhouse(cfg.boardSlug)
      : await fetchLever(cfg.boardSlug)
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
