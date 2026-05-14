// Greenhouse public job-board fetcher.
//
// Docs: https://developers.greenhouse.io/job-board.html
// Endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
// Auth:     none (publicly readable)
// Rate:     not documented; we sync every 4h so we're well under any reasonable limit
//
// Note: Greenhouse public API does NOT expose salary or employment_type cleanly.
// We default employment_type to 'full_time' and leave salary null. If we add
// per-employer overrides later, those can be applied at the DB layer.

import type { ExternalJob, ImportResult } from './types'
import { parseUsLocation } from './locations'
import { isHealthcareRelevant } from './healthcare-filter'
import { htmlToText } from './html-to-text'

interface GreenhouseDepartment {
  id?: number
  name?: string
}
interface GreenhouseJob {
  id: number
  title: string
  updated_at: string
  location?: { name?: string }
  absolute_url?: string
  content?: string
  departments?: GreenhouseDepartment[]
}
interface GreenhouseResponse {
  jobs: GreenhouseJob[]
  meta?: { total?: number }
}

export async function fetchGreenhouseBoard(boardToken: string): Promise<ImportResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    boardToken,
  )}/jobs?content=true`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // 30s timeout for slow boards
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    throw new Error(`Greenhouse board "${boardToken}" returned ${res.status}`)
  }
  const data = (await res.json()) as GreenhouseResponse
  const raw = data.jobs ?? []

  let droppedNonUs = 0
  let droppedNonHealthcare = 0
  const jobs: ExternalJob[] = []

  for (const j of raw) {
    const dept = j.departments?.[0]?.name ?? null
    // Healthcare filter — cheap title/department check
    if (!isHealthcareRelevant(j.title, dept)) {
      droppedNonHealthcare += 1
      continue
    }
    // US-only filter
    const loc = parseUsLocation(j.location?.name)
    if (!loc.us) {
      droppedNonUs += 1
      continue
    }
    // Apply URL — Greenhouse provides absolute_url which routes to the employer's
    // hosted job page; that's the safest landing surface (no Greenhouse-only flow).
    const applyUrl = j.absolute_url ?? `https://boards.greenhouse.io/${boardToken}/jobs/${j.id}`
    jobs.push({
      external_id: String(j.id),
      title: j.title,
      description: htmlToText(j.content ?? ''),
      apply_url: applyUrl,
      city: loc.city,
      state: loc.state,
      remote_hybrid: loc.remote ? 'remote' : 'onsite',
      employment_type: 'full_time',
      salary_min: null,
      salary_max: null,
      source: `greenhouse:${boardToken}`,
      updated_at: j.updated_at,
    })
  }

  return {
    provider: 'greenhouse',
    boardSlug: boardToken,
    totalFetched: raw.length,
    totalUsKept: jobs.length,
    droppedNonUs,
    droppedNonHealthcare,
    jobs,
  }
}
