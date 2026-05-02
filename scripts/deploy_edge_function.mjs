#!/usr/bin/env node
// Deploy a Supabase Edge Function via the Management API.
//
// Usage:
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs <slug> <path-to-index.ts> [--no-verify-jwt]
//
// Example:
//   SUPABASE_PAT=... node scripts/deploy_edge_function.mjs apply-notify ../../avahealth-crm/supabase/functions/apply-notify/index.ts --no-verify-jwt
//
// What this does:
//   - Reads the function source from the given file path
//   - PATCHes (or POSTs if new) the function via Management API
//   - Confirms the deploy by re-fetching the function metadata
//
// Notes:
//   - PROJECT_REF is hardcoded to the freejobpost/freeresumepost shared project
//   - --no-verify-jwt is required for public-facing functions like
//     apply-notify, post-job-verify, post-job-send-verify, employer-login-send

import fs from 'node:fs'

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

const source = fs.readFileSync(sourcePath, 'utf8')
const baseUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`

async function api(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, ok: res.ok, data }
}

// Check if function exists
const existing = await api('GET', `/${slug}`)
if (existing.status === 404) {
  console.log(`Function ${slug} does not exist; creating…`)
  const create = await api('POST', '', {
    slug,
    name: slug,
    verify_jwt: !noVerifyJwt,
    body: source,
  })
  if (!create.ok) {
    console.error('Create failed:', create.status, JSON.stringify(create.data))
    process.exit(1)
  }
  console.log('Created.')
} else if (existing.ok) {
  console.log(`Function ${slug} exists; updating…`)
  const update = await api('PATCH', `/${slug}`, {
    name: slug,
    verify_jwt: !noVerifyJwt,
    body: source,
  })
  if (!update.ok) {
    console.error('Update failed:', update.status, JSON.stringify(update.data))
    process.exit(1)
  }
  console.log('Updated.')
} else {
  console.error('Lookup failed:', existing.status, JSON.stringify(existing.data))
  process.exit(1)
}

// Confirm
const after = await api('GET', `/${slug}`)
if (after.ok) {
  console.log(`Function ${slug} deployed:`, JSON.stringify({
    slug: after.data.slug,
    version: after.data.version,
    verify_jwt: after.data.verify_jwt,
    status: after.data.status,
  }))
} else {
  console.warn('Could not confirm deploy:', after.status, JSON.stringify(after.data))
}
