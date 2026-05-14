#!/usr/bin/env node
// Generate an upsert SQL file from the curated ATS boards in seed-boards.ts.
//
// Run with:  node scripts/generate-ats-import-sql.mjs > out/ats-import.sql
// Then apply via Supabase MCP execute_sql.
//
// This script intentionally duplicates the fetch + filter logic from
// src/lib/ats-import/ so it can run without a TS build step. The canonical
// implementation lives in src/lib/ats-import/ — this file is the bootstrap
// glue for the first import.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ── State lookup ─────────────────────────────────────────────────────────
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

// ── Healthcare filter ─────────────────────────────────────────────────────
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

// ── HTML → text ───────────────────────────────────────────────────────────
function htmlToText(html) {
  if (!html) return ''
  // Run TWO decode passes so double-encoded entities like &amp;nbsp; resolve
  // correctly. First pass turns &amp;X into &X; second pass decodes &X.
  // Decode &amp; first within each pass so it doesn't strand the inner entity.
  const decodeOnce = (str) =>
    str
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
      .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
      .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  let s = decodeOnce(decodeOnce(html))
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*p\s*>/gi, '\n\n')
       .replace(/<\s*\/\s*div\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ')
       .replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*\/\s*ul\s*>/gi, '\n')
       .replace(/<[^>]+>/g, '')
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Slug helpers ──────────────────────────────────────────────────────────
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

// ── Fetchers ──────────────────────────────────────────────────────────────
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
      external_id: String(j.id),
      title: j.title,
      description: htmlToText(j.content ?? ''),
      apply_url: j.absolute_url ?? `https://boards.greenhouse.io/${token}/jobs/${j.id}`,
      city: loc.city, state: loc.state,
      remote_hybrid: loc.remote ? 'remote' : 'onsite',
      employment_type: 'full_time',
      salary_min: null, salary_max: null,
      source: `greenhouse:${token}`,
      provider: 'greenhouse',
    })
  }
  return { provider: 'greenhouse', token, fetched: raw.length, jobs: out }
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
      external_id: p.id,
      title: p.text,
      description: p.descriptionPlain || (p.description ?? '').replace(/<[^>]+>/g, '').trim(),
      apply_url: p.applyUrl ?? p.hostedUrl ?? `https://jobs.lever.co/${slug}/${p.id}`,
      city: loc.city, state: loc.state,
      remote_hybrid: remote,
      employment_type: COMMITMENT_MAP[commit] ?? 'full_time',
      salary_min: isUsdAnnual && typeof sal.min === 'number' ? sal.min : null,
      salary_max: isUsdAnnual && typeof sal.max === 'number' ? sal.max : null,
      source: `lever:${slug}`,
      provider: 'lever',
    })
  }
  return { provider: 'lever', token: slug, fetched: raw.length, jobs: out }
}

// ── SQL emitters ──────────────────────────────────────────────────────────
function sqlQuote(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

const SEED_BOARDS = [
  {
    provider: 'greenhouse',
    boardSlug: 'oscar',
    companyName: 'Oscar Health',
    companyUrl: 'https://www.hioscar.com',
    employerSlug: 'oscar-health',
  },
  {
    provider: 'lever',
    boardSlug: 'lyrahealth',
    companyName: 'Lyra Health',
    companyUrl: 'https://www.lyrahealth.com',
    employerSlug: 'lyra-health',
  },
]

const banner = `-- ATS import — generated ${new Date().toISOString()}
-- Run via Supabase MCP execute_sql. Each statement calls
-- public.ats_import_upsert_jobs() with a JSONB chunk of jobs.
-- Idempotent: re-running upserts on (slug) for employers and (external_ref) for jobs.

`

const CHUNK_SIZE = 4  // jobs per call — keeps each SQL string < ~25KB so we can Read + relay each chunk in one shot

let out = banner
let totalKept = 0, totalFetched = 0
const errors = []
const boardChunks = {}  // {boardKey: [chunk1, chunk2, ...]} for per-board file output

for (const cfg of SEED_BOARDS) {
  let result
  try {
    result = cfg.provider === 'greenhouse'
      ? await fetchGreenhouse(cfg.boardSlug)
      : await fetchLever(cfg.boardSlug)
  } catch (e) {
    errors.push(`${cfg.provider}:${cfg.boardSlug} — ${e.message}`)
    continue
  }
  totalFetched += result.fetched
  totalKept += result.jobs.length

  const boardKey = `${cfg.provider}-${cfg.boardSlug}`
  boardChunks[boardKey] = []

  // Chunk the jobs and emit one ats_import_upsert_jobs() call per chunk.
  for (let i = 0; i < result.jobs.length; i += CHUNK_SIZE) {
    const chunk = result.jobs.slice(i, i + CHUNK_SIZE)
    const jsonRows = chunk.map((j) => ({
      slug: buildAtsSlug(j.title, cfg.provider, j.external_id),
      title: j.title,
      description: j.description,
      city: j.city,
      state: j.state,
      remote_hybrid: j.remote_hybrid,
      employment_type: j.employment_type,
      salary_min: j.salary_min,
      salary_max: j.salary_max,
      apply_url: j.apply_url,
      source: j.source,
      external_ref: `${j.source}:${j.external_id}`,
    }))
    const jsonLit = JSON.stringify(jsonRows).replace(/'/g, "''")
    const sql = `-- ${cfg.companyName} chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} jobs)
SELECT public.ats_import_upsert_jobs(
  ${sqlQuote(cfg.employerSlug)},
  ${sqlQuote(cfg.companyName)},
  ${sqlQuote(cfg.companyUrl)},
  ${sqlQuote(cfg.provider)},
  ${sqlQuote(cfg.boardSlug)},
  '${jsonLit}'::jsonb
);
`
    out += sql + '\n'
    boardChunks[boardKey].push(sql)
  }
}

if (errors.length) {
  out += `-- Errors (boards that failed to fetch):\n` + errors.map((e) => `--   ${e}`).join('\n') + '\n'
}
out += `-- Summary: ${totalKept} kept of ${totalFetched} fetched across ${SEED_BOARDS.length} boards\n`

const outDir = resolve(repoRoot, 'out')
mkdirSync(outDir, { recursive: true })

// Combined file (for archive / human review)
const combinedFile = resolve(outDir, 'ats-import.sql')
writeFileSync(combinedFile, out, 'utf8')
console.error(`Wrote ${combinedFile}`)

// Per-board + per-chunk files (each chunk is one execute_sql call).
for (const cfg of SEED_BOARDS) {
  const boardKey = `${cfg.provider}-${cfg.boardSlug}`
  const chunks = boardChunks[boardKey] ?? []
  chunks.forEach((sql, idx) => {
    const file = resolve(outDir, `ats-import-${boardKey}-chunk-${String(idx + 1).padStart(2, '0')}.sql`)
    writeFileSync(file, sql, 'utf8')
    console.error(`Wrote ${file}  (${(sql.length / 1024).toFixed(1)} KB)`)
  })
}

console.error(`Boards: ${SEED_BOARDS.length}  Fetched: ${totalFetched}  Kept: ${totalKept}  Errors: ${errors.length}`)
if (errors.length) errors.forEach((e) => console.error('  - ' + e))
