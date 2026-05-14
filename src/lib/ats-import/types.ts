// Shared types for the ATS importer.
//
// An ExternalJob is the normalized shape we get out of any provider (Greenhouse,
// Lever, etc.) before it goes into the DB. The DB writer then maps these to
// public_jobs rows and dedupes by (source, external_id).

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby'

export interface ExternalJob {
  /** Stable ID from the provider (e.g. Greenhouse job ID, Lever posting UUID).
   *  Combined with `source` to dedupe on re-import. */
  external_id: string
  title: string
  /** Plain-text job description. HTML is stripped before storage. */
  description: string
  /** Direct apply URL — points back to the provider's hosted page so the
   *  employer's own apply funnel runs (no candidate data sits with us). */
  apply_url: string
  city: string | null
  /** 2-letter US state code if parseable AND in the US. null for non-US. */
  state: string | null
  remote_hybrid: 'remote' | 'hybrid' | 'onsite' | null
  employment_type:
    | 'full_time'
    | 'part_time'
    | 'contract'
    | 'locum'
    | 'per_diem'
    | 'internship'
    | null
  salary_min: number | null
  salary_max: number | null
  /** Origin tag, e.g. 'greenhouse:oscar' or 'lever:lyrahealth'. Used both
   *  in `public_jobs.source` and for dedupe. */
  source: string
  /** ISO timestamp from the provider — used to detect changes on re-sync. */
  updated_at: string
}

export interface ImportResult {
  provider: AtsProvider
  boardSlug: string
  /** How many jobs the provider returned in total (incl. non-US, non-published). */
  totalFetched: number
  /** How many made it through the US-only + healthcare filters. */
  totalUsKept: number
  /** How many were dropped for being non-US. */
  droppedNonUs: number
  /** How many were dropped for being non-healthcare (we keep the filter loose). */
  droppedNonHealthcare: number
  jobs: ExternalJob[]
}
