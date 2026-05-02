#!/usr/bin/env node
// Deploy a Supabase Edge Function via the Management API.
//
// Usage:
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs <slug> <path-to-index.ts> [--no-verify-jwt]
//
// Example:
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs apply-notify ../avahealth-crm/supabase/functions/apply-notify/index.ts --no-verify-jwt
//
// What this does:
//   - Reads the function source from the given file path
//   - POSTs multipart form data to the deploy endpoint
//   - Confirms the deploy by re-fetching the function metadata
//
// Notes:
//   - PROJECT_REF is hardcoded to the freejobpost/freeresumepost shared project
//   - --no-verify-jwt is required for public-facing functions like
//     apply-notify, post-job-verify, post-job-send-verify, employer-login-send
//   - Supabase Edge Runtime expects the source as a file upload (not inline
//     body) because functions get bundled into an eszip on the server side.

import fs from 'node:fs'
import path from 'node:path'

const PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const PAT = process.env.SUPABASE_PAT
if (!PAT) {
  console.error('SUPABASE_PAT env var required')
  process.exit(1)
}

const slug = process.argv[2]
const sourcePath = process.argv[3]
const noVerifyJwt = process.argv.includes('--no-verify-jwt')
if (!slug || !sourcePath) {
  console.error('Usage: node scripts/deploy_edge_function.mjs <slug> <path-to-index.ts> [--no-verify-jwt]')
  process.exit(1)
}

const absSource = path.resolve(sourcePath)
if (!fs.existsSync(absSource)) {
  console.error(`Source file not found: ${absSource}`)
  process.exit(1)
}
const sourceContent = fs.readFileSync(absSource, 'utf8')

// Build multipart form data manually (Node 24+ has native FormData + Blob)
const form = new FormData()
form.set(
  'metadata',
  JSON.stringify({
    name: slug,
    verify_jwt: !noVerifyJwt,
    entrypoint_path: 'index.ts',
  })
)
form.set('file', new Blob([sourceContent], { type: 'application/typescript' }), 'index.ts')

const deployUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${encodeURIComponent(slug)}`
console.log(`POST ${deployUrl}`)
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
