#!/usr/bin/env node
// Read AWS IAM access keys from a downloaded credentials CSV and set them as
// Supabase Edge Function secrets. The keys never enter chat history or shell
// command-line arguments — they go file → script → Supabase secrets API.
//
// Usage:
//   SUPABASE_PAT=... node scripts/set_aws_secrets_from_csv.mjs <path-to-csv>
//
// Example:
//   SUPABASE_PAT=... node scripts/set_aws_secrets_from_csv.mjs ~/Downloads/freejobpost-ses_accessKeys.csv
//
// AWS CSV format (downloaded from the IAM "Retrieve access keys" page):
//   Access key ID,Secret access key
//   AKIA...,...
//
// Sets these Supabase secrets (overwrites if they already exist):
//   AWS_ACCESS_KEY_ID
//   AWS_SECRET_ACCESS_KEY
//   AWS_REGION  (defaults to us-east-1)

import fs from 'node:fs'
import path from 'node:path'

const PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const PAT = process.env.SUPABASE_PAT
if (!PAT) {
  console.error('SUPABASE_PAT env var required')
  process.exit(1)
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/set_aws_secrets_from_csv.mjs <path-to-csv>')
  process.exit(1)
}
const absPath = path.resolve(csvPath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || ''))
if (!fs.existsSync(absPath)) {
  console.error(`CSV file not found: ${absPath}`)
  process.exit(1)
}

const csv = fs.readFileSync(absPath, 'utf8').trim()
const lines = csv.split(/\r?\n/)
if (lines.length < 2) {
  console.error('CSV must have at least a header + one data row')
  process.exit(1)
}

// Parse header to find the right columns regardless of CSV column order/extras
const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
const dataRow = lines[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
const idIdx = header.findIndex((h) => /access key id/i.test(h))
const secretIdx = header.findIndex((h) => /secret access key/i.test(h))
if (idIdx < 0 || secretIdx < 0) {
  console.error('Could not find "Access key ID" / "Secret access key" columns in header:', header)
  process.exit(1)
}

const accessKeyId = dataRow[idIdx]
const secretAccessKey = dataRow[secretIdx]
if (!/^AKIA[A-Z0-9]{16}$/.test(accessKeyId)) {
  console.error('Access key ID does not match expected AKIA[A-Z0-9]{16} pattern; aborting')
  process.exit(1)
}
if (secretAccessKey.length < 30) {
  console.error('Secret access key looks suspiciously short; aborting')
  process.exit(1)
}

console.log(`Parsed credentials from CSV.`)
console.log(`  Access key ID: ${accessKeyId.slice(0, 8)}…${accessKeyId.slice(-4)} (${accessKeyId.length} chars)`)
console.log(`  Secret access key: ${secretAccessKey.length} chars (hidden)`)

// Set Supabase secrets via Management API
// POST /v1/projects/{ref}/secrets accepts an array of { name, value }.
const body = [
  { name: 'AWS_ACCESS_KEY_ID', value: accessKeyId },
  { name: 'AWS_SECRET_ACCESS_KEY', value: secretAccessKey },
  { name: 'AWS_REGION', value: 'us-east-1' },
]

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${PAT}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})

const text = await res.text()
if (!res.ok) {
  console.error(`Supabase secrets API returned ${res.status}:`)
  console.error(text)
  process.exit(1)
}

console.log(`\n✓ Secrets set in Supabase project ${PROJECT_REF}:`)
console.log(`  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION`)
console.log(`\nYou can now safely delete ${absPath} from your downloads.`)
