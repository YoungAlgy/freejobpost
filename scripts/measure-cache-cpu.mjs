// Reproduce @opennextjs/aws cacheInterceptor.js's per-request CPU cost against
// the real .open-next incremental-cache files produced by `npm run cf:build`.
//
// The interceptor's hot path for a cached `type: "app"` entry does three things
// whose cost scales linearly with size, on EVERY request:
//
//   r2Object.json()        -> JSON.parse(ENTIRE cache object)   ← whole file
//   computeCacheControl()  -> md5(body)                          ← html only
//   toReadableStream(body) -> TextEncoder().encode(body)         ← html only
//
// Note the asymmetry: parse pays for html + rsc + segmentData, while md5 and
// encode pay only for the html the client actually receives. That is why a file
// can be 2.7MB while its "body" is under 1MB — and why trimming the non-html
// keys is a real saving even though no user ever downloads them.
//
// Usage:
//   node scripts/measure-cache-cpu.mjs                 # sweep, top 40 by CPU
//   node scripts/measure-cache-cpu.mjs --all           # every entry
//   node scripts/measure-cache-cpu.mjs --top 100
//   node scripts/measure-cache-cpu.mjs --reps 25 <route> [route...]
//   node scripts/measure-cache-cpu.mjs --json out.json # machine-readable dump
//
// Routes are cache-relative paths without the .cache suffix, e.g.
// `jobs/federal/va`, `state/north-carolina`.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CACHE_ROOT = '.open-next/cache'

function findBuildDir() {
  const entries = fs.readdirSync(CACHE_ROOT, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && e.name !== '__fetch')
  if (dirs.length === 0) throw new Error(`no build dir under ${CACHE_ROOT} — run \`npm run cf:build\` first`)
  if (dirs.length > 1) {
    // More than one build id means a stale directory is lying around; measuring
    // the wrong one silently reports the wrong numbers.
    const newest = dirs
      .map((d) => ({ d, m: fs.statSync(path.join(CACHE_ROOT, d.name)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0].d
    console.warn(`⚠️  ${dirs.length} build dirs present; using newest: ${newest.name}`)
    return path.join(CACHE_ROOT, newest.name)
  }
  return path.join(CACHE_ROOT, dirs[0].name)
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, base, out)
    else if (e.name.endsWith('.cache')) {
      out.push({
        route: path.relative(base, p).replace(/\\/g, '/').replace(/\.cache$/, ''),
        file: p,
      })
    }
  }
  return out
}

/** Median is the honest statistic here — GC pauses make the mean lie high. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function timeIt(reps, fn) {
  for (let i = 0; i < 3; i++) fn() // warm the JIT
  const samples = []
  for (let i = 0; i < reps; i++) {
    const t = process.hrtime.bigint()
    fn()
    samples.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  return median(samples)
}

export function measure(file, reps = 9) {
  const raw = fs.readFileSync(file, 'utf8')
  const obj = JSON.parse(raw)

  // Mirror generateResult(): a normal (non-RSC) request for an `app` entry
  // serves cachedValue.html. `route` entries (sitemaps, feeds) serve .body.
  let body = ''
  if (obj.type === 'app') body = obj.html ?? ''
  else if (obj.type === 'page') body = obj.html ?? ''
  else if (obj.type === 'route') body = obj.body ?? ''

  const parseMs = timeIt(reps, () => JSON.parse(raw))
  const md5Ms = timeIt(reps, () => createHash('md5').update(body).digest('hex'))
  const encodeMs = timeIt(reps, () => new TextEncoder().encode(body))

  const seg = obj.segmentData ? JSON.stringify(obj.segmentData).length : 0
  return {
    route: null,
    type: obj.type,
    fileBytes: raw.length,
    htmlBytes: (obj.html ?? '').length,
    rscBytes: (obj.rsc ?? '').length,
    segmentBytes: seg,
    bodyBytes: body.length,
    parseMs,
    md5Ms,
    encodeMs,
    totalMs: parseMs + md5Ms + encodeMs,
  }
}

const mb = (n) => (n / 1024 / 1024).toFixed(2)
const kb = (n) => (n / 1024).toFixed(0)

function main() {
  const argv = process.argv.slice(2)
  const buildDir = findBuildDir()
  const flag = (name, dflt) => {
    const i = argv.indexOf(name)
    if (i === -1) return dflt
    const v = argv[i + 1]
    argv.splice(i, v === undefined ? 1 : 2)
    return v ?? true
  }
  const reps = Number(flag('--reps', 9))
  const jsonOut = flag('--json', null)
  const all = argv.includes('--all')
  const topN = Number(flag('--top', 40))
  const routes = argv.filter((a) => !a.startsWith('--'))

  let files = walk(buildDir)
  if (routes.length) {
    files = routes.map((r) => {
      const f = path.join(buildDir, `${r}.cache`)
      if (!fs.existsSync(f)) throw new Error(`no cache entry for route "${r}" (${f})`)
      return { route: r, file: f }
    })
  }

  const rows = files.map(({ route, file }) => ({ ...measure(file, reps), route }))
  rows.sort((a, b) => b.totalMs - a.totalMs)

  const shown = routes.length || all ? rows : rows.slice(0, topN)

  console.log(`build: ${path.basename(buildDir)}   entries: ${rows.length}   reps: ${reps}`)
  console.log('')
  console.log(
    'route'.padEnd(46) +
      'file'.padStart(8) +
      'html'.padStart(8) +
      'rsc'.padStart(8) +
      'seg'.padStart(8) +
      'parse'.padStart(8) +
      'md5'.padStart(8) +
      'enc'.padStart(8) +
      'TOTAL'.padStart(9) +
      '  budget',
  )
  console.log('-'.repeat(46 + 8 * 7 + 9 + 9))
  for (const r of shown) {
    const pct = (r.totalMs / 10) * 100
    const bar = pct >= 90 ? '🔴' : pct >= 60 ? '🟠' : pct >= 35 ? '🟡' : '🟢'
    console.log(
      ('/' + r.route).slice(0, 45).padEnd(46) +
        `${kb(r.fileBytes)}K`.padStart(8) +
        `${kb(r.htmlBytes)}K`.padStart(8) +
        `${kb(r.rscBytes)}K`.padStart(8) +
        `${kb(r.segmentBytes)}K`.padStart(8) +
        r.parseMs.toFixed(2).padStart(8) +
        r.md5Ms.toFixed(2).padStart(8) +
        r.encodeMs.toFixed(2).padStart(8) +
        r.totalMs.toFixed(2).padStart(9) +
        `  ${pct.toFixed(0).padStart(3)}% ${bar}`,
    )
  }

  const over = rows.filter((r) => r.totalMs / 10 >= 0.6).length
  const warn = rows.filter((r) => r.totalMs / 10 >= 0.35).length
  console.log('')
  console.log(`worst: /${rows[0].route}  ${rows[0].totalMs.toFixed(2)}ms (${((rows[0].totalMs / 10) * 100).toFixed(0)}% of the 10ms budget)`)
  console.log(`entries >=60% of budget: ${over}    >=35%: ${warn}    total: ${rows.length}`)
  console.log(`sum of all cache files: ${mb(rows.reduce((s, r) => s + r.fileBytes, 0))} MB`)

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 2))
    console.log(`\nwrote ${jsonOut}`)
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('measure-cache-cpu.mjs')) {
  main()
}
