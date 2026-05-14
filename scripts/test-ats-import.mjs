#!/usr/bin/env node
// Quick smoke test for the ATS importer. Runs against real public boards and
// dumps a sample of normalized jobs so we can eyeball data quality before
// wiring up the DB write path.
//
// Run with:  node scripts/test-ats-import.mjs
//
// Since the importer is TypeScript-source, we load it via tsx. For now, this
// script duplicates the fetcher logic inline — it's a one-shot eyeball check,
// not a permanent test fixture. The lib at src/lib/ats-import/ is the canonical
// implementation; this script just hits the same endpoints with the same
// parsing rules and prints what we'd insert.

const GREENHOUSE_URL = (token) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
const LEVER_URL = (slug) =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`

// US state lookup (subset — same source-of-truth as src/lib/state-slugs.ts)
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
  if (/\b(india|tokyo|japan|johannesburg|south africa|london|uk|united kingdom|canada|berlin|germany|brazil|mexico|spain|france|ireland|singapore|amsterdam|sydney|australia|emea|apac|latam|philippines)\b/i.test(s)) {
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
  return { us: false, city: null, state: null, remote: false }
}

const HEALTHCARE_RE = [
  /\bphysician\b/i, /\bdoctor\b/i, /\bmedical director\b/i,
  /\b(nurse|nursing)\b/i, /\brn\b/i, /\blpn\b/i, /\bnurse practitioner\b/i,
  /\bcrna\b/i, /\bpa[\s-]c\b/i, /\bphysician assistant\b/i,
  /\btherapist\b/i, /\bcounsel(or|lor)\b/i, /\bpsychiatrist\b/i, /\bpsychologist\b/i,
  /\bsocial work\b/i, /\blcsw\b/i, /\blmft\b/i, /\blpc\b/i,
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
function isHealthcareRelevant(title, dept) {
  const h = `${title} ${dept ?? ''}`
  return HEALTHCARE_RE.some((re) => re.test(h))
}

function htmlToText(html) {
  if (!html) return ''
  let s = html
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*\/\s*p\s*>/gi, '\n\n')
       .replace(/<\s*li[^>]*>/gi, '• ').replace(/<\s*\/\s*li\s*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  return s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
}

async function runGreenhouse(token) {
  const res = await fetch(GREENHOUSE_URL(token))
  if (!res.ok) throw new Error(`GH ${token}: ${res.status}`)
  const { jobs: raw } = await res.json()
  const kept = []
  let droppedNonUs = 0, droppedNonHc = 0
  for (const j of raw ?? []) {
    const dept = j.departments?.[0]?.name ?? null
    if (!isHealthcareRelevant(j.title, dept)) { droppedNonHc++; continue }
    const loc = parseUsLocation(j.location?.name)
    if (!loc.us) { droppedNonUs++; continue }
    kept.push({
      external_id: String(j.id),
      title: j.title,
      description: htmlToText(j.content ?? '').slice(0, 300) + '…',
      apply_url: j.absolute_url,
      city: loc.city, state: loc.state,
      remote_hybrid: loc.remote ? 'remote' : 'onsite',
      employment_type: 'full_time',
      source: `greenhouse:${token}`,
      department: dept,
    })
  }
  return { provider: 'greenhouse', token, totalFetched: raw?.length ?? 0, kept, droppedNonUs, droppedNonHc }
}

async function runLever(slug) {
  const res = await fetch(LEVER_URL(slug))
  if (!res.ok) throw new Error(`Lever ${slug}: ${res.status}`)
  const raw = await res.json()
  const kept = []
  let droppedNonUs = 0, droppedNonHc = 0
  for (const p of raw) {
    const dept = p.categories?.department ?? p.categories?.team ?? null
    if (!isHealthcareRelevant(p.text, dept)) { droppedNonHc++; continue }
    const loc = parseUsLocation(p.categories?.location)
    if (!loc.us) { droppedNonUs++; continue }
    const remote = (loc.remote || p.workplaceType === 'remote') ? 'remote'
                 : p.workplaceType === 'hybrid' ? 'hybrid' : 'onsite'
    kept.push({
      external_id: p.id,
      title: p.text,
      description: (p.descriptionPlain || '').slice(0, 300) + '…',
      apply_url: p.applyUrl ?? p.hostedUrl,
      city: loc.city, state: loc.state,
      remote_hybrid: remote,
      employment_type: (p.categories?.commitment ?? 'Full-time').toLowerCase().replace('-', '_'),
      salary_min: p.salaryRange?.min ?? null,
      salary_max: p.salaryRange?.max ?? null,
      source: `lever:${slug}`,
      department: dept,
    })
  }
  return { provider: 'lever', token: slug, totalFetched: raw.length, kept, droppedNonUs, droppedNonHc }
}

function summarize(r) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`${r.provider.toUpperCase()}  ${r.token}`)
  console.log(`${'='.repeat(70)}`)
  console.log(`Fetched:           ${r.totalFetched}`)
  console.log(`Kept (US + hc):    ${r.kept.length}`)
  console.log(`Dropped non-US:    ${r.droppedNonUs}`)
  console.log(`Dropped non-hc:    ${r.droppedNonHc}`)
  console.log(`---`)
  console.log(`Sample (first ${Math.min(5, r.kept.length)} kept):`)
  for (const j of r.kept.slice(0, 5)) {
    console.log(``)
    console.log(`  [${j.external_id}] ${j.title}`)
    console.log(`    where:  ${[j.city, j.state].filter(Boolean).join(', ') || '—'}  (${j.remote_hybrid})`)
    console.log(`    dept:   ${j.department ?? '—'}`)
    console.log(`    type:   ${j.employment_type}`)
    if (j.salary_min || j.salary_max) {
      console.log(`    pay:    ${j.salary_min ?? '?'} – ${j.salary_max ?? '?'}`)
    }
    console.log(`    apply:  ${j.apply_url}`)
    console.log(`    src:    ${j.source}`)
    console.log(`    desc:   ${j.description.slice(0, 150).replace(/\n/g, ' ')}`)
  }
}

const targets = [
  { provider: 'greenhouse', token: 'oscar' },
  { provider: 'greenhouse', token: 'alma' },
  { provider: 'lever', token: 'lyrahealth' },
]

for (const t of targets) {
  try {
    const r = t.provider === 'greenhouse' ? await runGreenhouse(t.token) : await runLever(t.token)
    summarize(r)
  } catch (e) {
    console.error(`${t.provider}:${t.token} FAILED:`, e.message)
  }
}
