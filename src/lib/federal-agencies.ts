// Federal healthcare-employer config. Drives the /jobs/federal SEO hub and the
// per-agency landing pages at /jobs/federal/[agency].
//
// Each agency has a slug (URL segment), display name, OPM-style full name, and
// a list of substring keywords matched against the USAJobs job title (and
// description, defensively). The match is case-insensitive ILIKE — kept loose
// because USAJobs titles vary widely ("RN — VA Long Beach", "Physician (VHA)",
// "Tripler Army Medical Center — Anesthesiologist", etc.).
//
// Keywords are deliberately specific enough to avoid cross-bucket leakage —
// "Veteran" alone would match the IHS "Native Veteran services" job titles, so
// we use "VA " (with trailing space) and "Veterans Affairs" / "VHA" instead.

export interface FederalAgency {
  slug: string
  name: string          // short display label
  fullName: string      // formal department name for H1/meta
  blurb: string         // 1-sentence positioning for the landing-page header
  /** Substring keywords (case-insensitive) matched against job.title for filtering. */
  titleKeywords: string[]
}

export const FEDERAL_AGENCIES: readonly FederalAgency[] = [
  {
    slug: 'va',
    name: 'VA',
    fullName: 'Department of Veterans Affairs',
    blurb:
      'Veterans Health Administration — the largest integrated healthcare network in the U.S., with 1,300+ medical facilities and ~80,000 clinical positions.',
    titleKeywords: ['VA ', 'Veterans Affairs', 'Veterans Health', 'VHA', 'Vet Center'],
  },
  {
    slug: 'ihs',
    name: 'IHS',
    fullName: 'Indian Health Service',
    blurb:
      'Indian Health Service — federal healthcare delivery to 2.8M American Indians and Alaska Natives across 12 regional Service Areas.',
    titleKeywords: ['Indian Health', 'IHS', 'Native American Health'],
  },
  {
    slug: 'dod',
    name: 'DoD',
    fullName: 'Department of Defense — Military Health',
    blurb:
      'Military Health System — Army, Navy, Air Force, and Defense Health Agency clinical roles supporting 9.6M service members, retirees, and dependents.',
    titleKeywords: [
      'Army Medical',
      'Naval Hospital',
      'Air Force',
      'Tripler',
      'Walter Reed',
      'DHA',
      'Defense Health',
      'Military Treatment',
      'MEDCEN',
      'Madigan',
      'Eisenhower Army',
    ],
  },
  {
    slug: 'nih',
    name: 'NIH',
    fullName: 'National Institutes of Health',
    blurb:
      'NIH — the federal government\'s biomedical research agency, including the Clinical Center hospital and 27 research institutes in Bethesda, MD.',
    titleKeywords: ['NIH', 'National Institutes of Health', 'National Cancer Institute'],
  },
  {
    slug: 'hhs',
    name: 'HHS',
    fullName: 'Health and Human Services',
    blurb:
      'HHS agencies — CDC, FDA, HRSA, SAMHSA, CMS, and other public-health and regulatory roles outside VA/IHS/DoD/NIH.',
    titleKeywords: [
      'Health and Human Services',
      'HHS',
      'CDC',
      'FDA',
      'CMS',
      'SAMHSA',
      'HRSA',
      'AHRQ',
      'Centers for Disease',
      'Food and Drug',
    ],
  },
] as const

export function findAgencyBySlug(slug: string): FederalAgency | undefined {
  return FEDERAL_AGENCIES.find((a) => a.slug === slug)
}

/**
 * Build a Supabase .or() filter matching any of the keywords against EITHER
 * job title OR description. USAJobs puts the originating agency in body text
 * (e.g. "The VA New Mexico Healthcare System is seeking..."), not the title
 * column — so a title-only filter undercounts every agency by ~50x.
 *
 * Each keyword expands to two ILIKE clauses (title + description), joined by
 * commas as PostgREST `.or()` expects. Wildcards are spelled `*` in the
 * PostgREST URL syntax and translated to SQL `%` by the gateway.
 */
export function agencyOrFilter(agency: FederalAgency): string {
  const clauses: string[] = []
  for (const kw of agency.titleKeywords) {
    const safe = kw.replace(/,/g, '\\,')
    clauses.push(`title.ilike.*${safe}*`)
    clauses.push(`description.ilike.*${safe}*`)
  }
  return clauses.join(',')
}

/** @deprecated kept for any pre-rename imports; new code should call agencyOrFilter. */
export const agencyTitleOrFilter = agencyOrFilter

/**
 * Returns true when the given job is attributable to `agency` — matches
 * any of the agency's titleKeywords against job.title or job.description
 * (case-insensitive substring). Mirrors the PostgREST .or() that
 * agencyOrFilter() builds.
 */
export function jobMatchesAgency(
  job: { title?: string | null; description?: string | null },
  agency: FederalAgency,
): boolean {
  const title = (job.title ?? '').toLowerCase()
  const desc = (job.description ?? '').toLowerCase()
  for (const kw of agency.titleKeywords) {
    const lower = kw.toLowerCase()
    if (title.includes(lower) || desc.includes(lower)) return true
  }
  return false
}
