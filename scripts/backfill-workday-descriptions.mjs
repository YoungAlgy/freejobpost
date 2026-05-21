#!/usr/bin/env node
// Workday description backfill runner.
//
// Invokes the `backfill-workday-descriptions` Supabase Edge Function in a
// loop until 0 candidates remain. The edge function itself is rate-limited
// (8 detail-fetches per batch, max 200 jobs per invocation) so we just keep
// calling it and reporting progress.
//
// Why this script: invoking the edge function ONCE backfills up to 200 jobs.
// We have ~2,300 thin-description rows post-2026-05-17 audit, so we need
// ~12 invocations at limit=200 (or ~46 at the default limit=50). Doing this
// by hand via curl is tedious + error-prone; this script handles the loop +
// gives a single resumable summary.
//
// Usage:
//
//   # Drain the entire backlog (recommended after Workday-detail fixes deploy):
//   node scripts/backfill-workday-descriptions.mjs
//
//   # Dry-run mode (no DB writes — just report what would change):
//   node scripts/backfill-workday-descriptions.mjs --dry-run
//
//   # Limit invocations (for incremental verification):
//   node scripts/backfill-workday-descriptions.mjs --max-invocations 3
//
//   # Restrict to a single Workday tenant (e.g. test on MGB first):
//   node scripts/backfill-workday-descriptions.mjs --board workday:massgeneralbrigham/MGBExternal
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// The service-role key is required because the edge function reads via
// SECURITY DEFINER RPCs that only grant EXECUTE to service_role.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  let v = trimmed.slice(eq + 1).trim()
  v = v.replace(/^["']|["']$/g, '')
  v = v.replace(/\\n$/, '').replace(/\\r$/, '').trim()
  env[k] = v
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

// ── Parse CLI args ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = args.includes('--dry-run')
const board = arg('--board') ?? null
const maxInvocations = Number.parseInt(arg('--max-invocations') ?? '100', 10)
const limit = Number.parseInt(arg('--limit') ?? '200', 10)
const minLength = Number.parseInt(arg('--min-length') ?? '300', 10)

// ── Run the loop ────────────────────────────────────────────────────────
const fnUrl = `${SUPABASE_URL}/functions/v1/backfill-workday-descriptions`

let totalCandidates = 0
let totalUpdated = 0
let totalSkipped = 0
let totalErrors = 0
let invocations = 0

console.log(`workday backfill runner ${dryRun ? '(DRY RUN) ' : ''}— starting`)
console.log(`  URL:           ${fnUrl}`)
console.log(`  limit/inv:     ${limit}`)
console.log(`  min_length:    ${minLength}`)
console.log(`  max inv:       ${maxInvocations}`)
if (board) console.log(`  board filter:  ${board}`)
console.log('')

while (invocations < maxInvocations) {
  invocations += 1
  const t0 = Date.now()
  let res
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        limit,
        min_length: minLength,
        ...(board ? { board } : {}),
        ...(dryRun ? { dry_run: true } : {}),
      }),
    })
  } catch (e) {
    console.error(`  [invocation ${invocations}] network error: ${e.message}`)
    break
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      `  [invocation ${invocations}] HTTP ${res.status}: ${text.slice(0, 300)}`
    )
    break
  }

  const body = await res.json()
  const dt = Date.now() - t0
  totalCandidates += body.candidates ?? 0
  totalUpdated += body.updated ?? 0
  totalSkipped += body.skipped ?? 0
  totalErrors += body.fetch_errors ?? 0

  console.log(
    `  [inv ${String(invocations).padStart(3, ' ')}] ` +
      `candidates=${body.candidates ?? 0} ` +
      `updated=${body.updated ?? 0} ` +
      `${dryRun ? `would_update=${body.would_update ?? 0} ` : ''}` +
      `skipped=${body.skipped ?? 0} ` +
      `errors=${body.fetch_errors ?? 0} ` +
      `(${dt}ms)`
  )

  if ((body.candidates ?? 0) === 0) {
    console.log('  backlog drained — done')
    break
  }
  // Gentle pacing: 1s between invocations so we don't hammer Workday
  // tenants. The edge function is parallel-8 internally, so true req/sec
  // is ~8 per inv * 1 inv/sec = 8 r/s per tenant. Below WD's per-tenant
  // ceilings as far as we've measured.
  await new Promise((r) => setTimeout(r, 1000))
}

console.log('')
console.log('summary:')
console.log(`  invocations:      ${invocations}`)
console.log(`  total candidates: ${totalCandidates}`)
console.log(`  total updated:    ${totalUpdated}`)
console.log(`  total skipped:    ${totalSkipped}`)
console.log(`  total errors:     ${totalErrors}`)
