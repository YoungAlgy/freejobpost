export type PublicJob = {
  id: string
  slug: string
  title: string
  description: string
  role: string | null
  specialty: string | null
  vertical: string
  city: string | null
  state: string | null
  remote_hybrid: 'remote' | 'hybrid' | 'onsite' | null
  employment_type: 'full_time' | 'part_time' | 'contract' | 'locum' | 'per_diem' | 'internship' | null
  salary_min: number | null
  salary_max: number | null
  experience_required: string | null
  apply_url: string | null
  source: string | null
  created_at: string
  expires_at: string
  employer_id: string | null
  // Real per-job hiring company (e.g. Adzuna's company.display_name). NULL/absent
  // => fall back to the joined employer's name. Optional so existing PublicJob
  // fixtures/literals don't all need updating; always present at runtime when
  // selected via JOB_LIST_FIELDS / JOB_DETAIL_FIELDS.
  company_name?: string | null
}

export const JOB_LIST_FIELDS =
  'id, slug, title, role, specialty, city, state, remote_hybrid, employment_type, salary_min, salary_max, created_at, employer_id, company_name' as const

export const JOB_DETAIL_FIELDS =
  'id, slug, title, description, role, specialty, vertical, city, state, remote_hybrid, employment_type, salary_min, salary_max, experience_required, apply_url, source, created_at, expires_at, employer_id, company_name' as const

// Lowest salary we treat as real. USAJobs GS-grade rows store a placeholder $1
// (34 live jobs as of the 2026-05-28 audit) where pay is "set by the GS table";
// a few other sources emit sub-$10K artifacts. Left raw, a $1 renders as a "$1"
// pill, ships as <salary>$1</salary> to Indeed/Jooble/Talent, and emits
// baseSalary.minValue:1 in Google-for-Jobs JSON-LD — all of which trip
// implausible-salary / feed-quality penalties. 10K is well under the lowest
// realistic full-time healthcare wage and well above the placeholders (mirrors
// freeresumepost's bucketize floor).
export const SALARY_FLOOR = 10_000

// Normalize a salary pair for OUTPUT: drop sub-floor placeholder values to null
// and null an inverted range. Every output surface (cards, the /jobs/[slug]
// pill, JobPosting JSON-LD, every partner feed) routes through this — directly
// or via formatSalary — so a $1 is treated as "no salary stated" rather than a
// real number. 2026-05-28 audit.
export function usableSalary(
  min: number | null,
  max: number | null,
): { min: number | null; max: number | null } {
  const lo = min != null && min >= SALARY_FLOOR ? min : null
  let hi = max != null && max >= SALARY_FLOOR ? max : null
  if (lo != null && hi != null && hi < lo) hi = null
  return { min: lo, max: hi }
}

export function formatSalary(minRaw: number | null, maxRaw: number | null): string | null {
  const { min, max } = usableSalary(minRaw, maxRaw)
  if (!min && !max) return null
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`)
  if (min && max && min !== max) return `${fmt(min)}-${fmt(max)}`
  return fmt(min ?? max ?? 0)
}

export function employmentLabel(t: PublicJob['employment_type']): string | null {
  if (!t) return null
  const map: Record<string, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    locum: 'Locum',
    per_diem: 'Per diem',
    internship: 'Internship',
  }
  return map[t] ?? t
}

export function remoteLabel(r: PublicJob['remote_hybrid']): string | null {
  if (!r) return null
  if (r === 'remote') return 'Remote'
  if (r === 'hybrid') return 'Hybrid'
  return 'Onsite'
}

export function locationLabel(job: Pick<PublicJob, 'city' | 'state'>): string {
  return [job.city, job.state].filter(Boolean).join(', ')
}

// Mirror of the DB slugify() — keep in sync; used when building URLs client-side
// but the seed + post-job flows are the authoritative slug producers.
export function slugify(input: string | null | undefined): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Google JobPosting employmentType enum mapping
export function mapToSchemaEmploymentType(t: PublicJob['employment_type']): string {
  const map: Record<string, string> = {
    full_time: 'FULL_TIME',
    part_time: 'PART_TIME',
    contract: 'CONTRACTOR',
    locum: 'TEMPORARY',
    per_diem: 'PER_DIEM',
    internship: 'INTERN',
  }
  return map[t ?? 'full_time'] ?? 'FULL_TIME'
}
