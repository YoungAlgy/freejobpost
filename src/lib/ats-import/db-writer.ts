// DB writer for ATS-imported jobs.
//
// Takes the normalized ExternalJob[] from greenhouse.ts / lever.ts and upserts
// them into public_jobs. Every imported row gets:
//   - is_ats_import = true          (CRM isolation flag)
//   - status = 'active'             (no review queue; the employer's own
//                                    job-board is the source of truth)
//   - syndication_targets = '{}'    (we don't push other people's jobs to
//                                    Indeed / Adzuna / etc. via our XML feeds)
//   - external_ref = source:external_id  (the unique upsert key)
//
// Each board also gets one synthetic public_employers row, identifiable by
// verified_via = 'ats_import' and a contact_email placeholder. This row exists
// so public_jobs.employer_id FK is satisfied and the employer-directory pages
// resolve correctly — but it does NOT show up in the verified-employer count
// on the homepage (that filter explicitly checks verified_via != 'seeded' and
// we'll check != 'ats_import' too in a follow-up).
//
// Idempotency:
//   - Employer upsert via public_employers.slug (unique index)
//   - Job upsert via public_jobs.external_ref (unique index)
// Running the importer twice produces 0 net changes.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExternalJob, ImportResult } from './types'

export interface BoardConfig {
  provider: 'greenhouse' | 'lever' | 'ashby'
  /** Board token (e.g. 'oscar' for boards.greenhouse.io/oscar) */
  boardSlug: string
  /** Display name for the employer row (e.g. "Oscar Health") */
  companyName: string
  /** Employer website (e.g. "https://www.hioscar.com") */
  companyUrl: string
  /** Stable slug for the public_employers row + /employers/[slug] page */
  employerSlug: string
}

export interface WriteResult {
  board: BoardConfig
  fetched: number
  upsertedJobs: number
  errors: string[]
  employerRowId: string
}

/**
 * Stable, human-readable, collision-resistant slug for an ATS-imported job.
 * Pattern: {title-slug-trunc-80}-{provider-prefix}-{external-id-suffix}
 *
 * For Greenhouse, external_id is a numeric (e.g. "7914907") — use the whole
 * thing. For Lever, it's a 36-char UUID — first 8 chars is enough entropy
 * given we also include the title slug.
 */
function buildAtsSlug(job: ExternalJob, provider: 'greenhouse' | 'lever' | 'ashby'): string {
  const titleSlug = job.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')

  const idPart =
    provider === 'greenhouse'
      ? `gh-${job.external_id}`
      : provider === 'ashby'
        ? `ab-${job.external_id.slice(0, 8)}`
        : `lv-${job.external_id.slice(0, 8)}`

  return `${titleSlug || 'job'}-${idPart}`
}

function placeholderContactEmail(boardSlug: string, provider: string): string {
  // Real DNS, intentionally a sink so no one tries to reply.
  return `noreply+ats-${provider}-${boardSlug}@freejobpost.co`
}

async function upsertEmployer(
  supabase: SupabaseClient,
  cfg: BoardConfig,
): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from('public_employers')
    .select('id')
    .eq('slug', cfg.employerSlug)
    .maybeSingle()
  if (selErr) throw new Error(`employer select: ${selErr.message}`)
  if (existing?.id) {
    // Update touch — keep company_name + url fresh in case the seed config
    // changed (e.g. company rebrand).
    const { error: updErr } = await supabase
      .from('public_employers')
      .update({
        company_name: cfg.companyName,
        company_url: cfg.companyUrl,
        verified_via: 'ats_import',
        status: 'active',
        // verified_at stays whatever it was; ATS-imported employers are
        // intentionally NOT marked "verified" the same way human-confirmed
        // employers are.
      })
      .eq('id', existing.id)
    if (updErr) throw new Error(`employer update: ${updErr.message}`)
    return existing.id
  }

  const { data: inserted, error: insErr } = await supabase
    .from('public_employers')
    .insert({
      slug: cfg.employerSlug,
      company_name: cfg.companyName,
      company_url: cfg.companyUrl,
      contact_email: placeholderContactEmail(cfg.boardSlug, cfg.provider),
      status: 'active',
      verified_via: 'ats_import',
      tier: 'free',
      verified_healthcare_org: true, // curated list = pre-vetted by us
    })
    .select('id')
    .single()
  if (insErr || !inserted) throw new Error(`employer insert: ${insErr?.message}`)
  return inserted.id
}

interface JobUpsertRow {
  employer_id: string
  slug: string
  title: string
  description: string
  city: string | null
  state: string | null
  remote_hybrid: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  apply_url: string
  source: string
  status: 'active'
  syndication_targets: string[]
  is_ats_import: true
  external_ref: string
  expires_at: string
  updated_at: string
}

function buildJobRow(
  job: ExternalJob,
  employerId: string,
  provider: 'greenhouse' | 'lever' | 'ashby',
): JobUpsertRow {
  return {
    employer_id: employerId,
    slug: buildAtsSlug(job, provider),
    title: job.title,
    description: job.description,
    city: job.city,
    state: job.state,
    remote_hybrid: job.remote_hybrid,
    employment_type: job.employment_type,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    apply_url: job.apply_url,
    source: job.source,
    status: 'active',
    syndication_targets: [], // do NOT push someone else's job to our XML feeds
    is_ats_import: true,
    external_ref: `${job.source}:${job.external_id}`,
    // Keep ATS jobs fresh for 60 days from the last sync; if the upstream
    // board still has them next sync they get renewed, if removed they expire.
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Upsert a single batch of ATS-imported jobs into public_jobs.
 *
 * Uses ON CONFLICT (external_ref) — relies on the existing
 * `idx_public_jobs_external_ref` unique index.
 */
export async function writeAtsBoard(
  supabase: SupabaseClient,
  cfg: BoardConfig,
  result: ImportResult,
): Promise<WriteResult> {
  const errors: string[] = []
  const employerRowId = await upsertEmployer(supabase, cfg)

  if (result.jobs.length === 0) {
    return { board: cfg, fetched: result.totalFetched, upsertedJobs: 0, errors, employerRowId }
  }

  const rows = result.jobs.map((j) => buildJobRow(j, employerRowId, cfg.provider))

  // Batch into 50-row chunks so a single bad row doesn't poison the entire run.
  let upserted = 0
  const CHUNK = 50
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('public_jobs')
      .upsert(chunk, { onConflict: 'external_ref' })
    if (error) {
      errors.push(`chunk ${i}-${i + chunk.length}: ${error.message}`)
      continue
    }
    upserted += chunk.length
  }

  return { board: cfg, fetched: result.totalFetched, upsertedJobs: upserted, errors, employerRowId }
}
