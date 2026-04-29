#!/usr/bin/env node
// Lightweight ad-hoc SQL runner for freejobpost session work.
// Hits Supabase Management API directly with SUPABASE_PAT.
// Usage: node scripts/sql_query.mjs '<sql>'
//        node scripts/sql_query.mjs --file <path.sql>
//        echo '<sql>' | node scripts/sql_query.mjs --stdin
import fs from 'node:fs'

const PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const PAT = process.env.SUPABASE_PAT
if (!PAT) {
  console.error('SUPABASE_PAT env var required')
  process.exit(1)
}

let sql
if (process.argv[2] === '--stdin') sql = fs.readFileSync(0, 'utf8')
else if (process.argv[2] === '--file') sql = fs.readFileSync(process.argv[3], 'utf8')
else sql = process.argv.slice(2).join(' ')
if (!sql || !sql.trim()) {
  console.error('No SQL provided')
  process.exit(1)
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  }
)
const body = await res.text()
if (!res.ok) {
  console.error(`[FAIL ${res.status}]\n${body}`)
  process.exit(1)
}
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2))
} catch {
  console.log(body)
}
