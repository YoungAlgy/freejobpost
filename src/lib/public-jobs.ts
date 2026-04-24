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
}

export const JOB_LIST_FIELDS =
  'id, slug, title, role, specialty, city, state, remote_hybrid, employment_type, salary_min, salary_max, created_at' as const

export const JOB_DETAIL_FIELDS =
  'id, slug, title, description, role, specialty, vertical, city, state, remote_hybrid, employment_type, salary_min, salary_max, experience_required, apply_url, source, created_at, expires_at' as const

export function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const fmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`)
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`
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
