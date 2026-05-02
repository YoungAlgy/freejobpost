#!/usr/bin/env node
// Deploy a Supabase Edge Function via the Management API.
//
// Usage:
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs <slug> <path-to-index.ts> [options]
//
// Options:
//   --no-verify-jwt     deploy without JWT verification (public endpoint)
//   --include <path>    extra file to bundle (relative path inside the
//                       deployed function root). Repeatable. Useful for
//                       shared modules: `--include _shared/ses.ts`
//                       The path can be absolute or relative to the
//                       entrypoint's directory.
//
// Example (single file):
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs apply-notify \
//     ../avahealth-crm/supabase/functions/apply-notify/index.ts --no-verify-jwt
//
// Example (multi-file bundle, sharing a helper):
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs apply-notify \
//     ../avahealth-crm/supabase/functions/apply-notify/index.ts \
//     --include ../avahealth-crm/supabase/functions/_shared/ses.ts \
//     --no-verify-jwt
//
// The entrypoint can then `import { sendSesEmail } from '../_shared/ses.ts'`.
// Bundle layout server-side mirrors the relative path you specify in --include.
//
// What this does:
//   - Reads the entrypoint source from <path-to-index.ts>
//   - Optionally reads any --include files
//   - POSTs multipart form data to the deploy endpoint with all files
//   - Confirms the deploy by re-fetching the function metadata
//
// Notes:
//   - PROJECT_REF is hardcoded to the freejobpost/freeresumepost shared project
//   - --no-verify-jwt is required for public-facing functions like
//     apply-notify, post-job-verify, post-job-send-verify, employer-login-send

import fs from 'node:fs'
import path from 'node:path'

const PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const PAT = process.env.SUPABASE_PAT
if (!PAT) {
  console.error('SUPABASE_PAT env var required')
  process.exit(1)
}

// Parse argv with simple flag handling.
const argv = process.argv.slice(2)
const positional = []
const includes = []
let noVerifyJwt = false
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--no-verify-jwt') {
    noVerifyJwt = true
  } else if (argv[i] === '--include') {
    if (!argv[i + 1]) {
      console.error('--include requires a path argument')
      process.exit(1)
    }
    includes.push(argv[++i])
  } else {
    positional.push(argv[i])
  }
}

const slug = positional[0]
const sourcePath = positional[1]
if (!slug || !sourcePath) {
  console.error(
    'Usage: node scripts/deploy_edge_function.mjs <slug> <path-to-index.ts> ' +
    '[--no-verify-jwt] [--include <path>]...'
  )
  process.exit(1)
}

// Resolve the entrypoint and its directory (used as base for --include).
const absEntrypoint = path.resolve(sourcePath)
if (!fs.existsSync(absEntrypoint)) {
  console.error(`Source file not found: ${absEntrypoint}`)
  process.exit(1)
}
const entrypointDir = path.dirname(absEntrypoint)
const entrypointSource = fs.readFileSync(absEntrypoint, 'utf8')

// Resolve --include files. The relative path the user specifies is BOTH the
// filesystem path (resolved against entrypointDir) AND the path used in the
// deployed bundle (so imports like '../_shared/ses.ts' from index.ts resolve).
const includedFiles = includes.map((rel) => {
  const abs = path.resolve(entrypointDir, rel)
  if (!fs.existsSync(abs)) {
    console.error(`--include file not found: ${abs}`)
    process.exit(1)
  }
  // Normalize forward slashes for the deployed bundle path.
  const bundlePath = rel.replace(/\\/g, '/')
  return { abs, bundlePath, content: fs.readFileSync(abs, 'utf8') }
})

// Build multipart form data manually (Node 24+ has native FormData + Blob).
// The Supabase Management API accepts a `metadata` JSON part plus one or
// more `file` parts. The filename in each file's Content-Disposition becomes
// the path inside the deployed bundle.
const form = new FormData()
form.set(
  'metadata',
  JSON.stringify({
    name: slug,
    verify_jwt: !noVerifyJwt,
    entrypoint_path: 'index.ts',
  })
)
form.set('file', new Blob([entrypointSource], { type: 'application/typescript' }), 'index.ts')
for (const inc of includedFiles) {
  form.append(
    'file',
    new Blob([inc.content], { type: 'application/typescript' }),
    inc.bundlePath
  )
}

const deployUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`
console.log(`POST ${deployUrl}`)
console.log(`  entrypoint: index.ts (${entrypointSource.length} bytes)`)
for (const inc of includedFiles) {
  console.log(`  +include:   ${inc.bundlePath} (${inc.content.length} bytes)`)
}

const res = await fetch(deployUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${PAT}` },
  body: form,
})
const text = await res.text()
let parsed
try { parsed = JSON.parse(text) } catch { parsed = text }

if (!res.ok) {
  console.error(`Deploy failed: ${res.status}`)
  console.error(parsed)
  process.exit(1)
}

console.log('Deploy response:', JSON.stringify(parsed, null, 2))

// Confirm
const confirm = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${slug}`, {
  headers: { Authorization: `Bearer ${PAT}` },
})
if (confirm.ok) {
  const meta = await confirm.json()
  console.log(`Function ${slug} now at version ${meta.version}, status ${meta.status}, verify_jwt=${meta.verify_jwt}`)
} else {
  console.warn('Could not confirm deploy:', confirm.status)
}
