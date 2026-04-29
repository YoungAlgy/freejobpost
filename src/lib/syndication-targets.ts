// Single source of truth for which job-board networks freejobpost.co can
// syndicate to. Used by:
//   - the post-job form (checkbox UI)
//   - the post-job server action (validation)
//   - every feed route under /jobs.xml + /feeds/*.xml (filter)
//   - the /feeds page (docs + submission instructions)
//
// Keep the `id` strings in sync with the syndication_targets text[] column
// on public_jobs and with the v_known whitelist inside
// set_pending_job_syndication_targets() in scripts/add-syndication-targets.sql.

export type SyndicationTargetId =
  | 'indeed'
  | 'ziprecruiter'
  | 'glassdoor'
  | 'linkedin'
  | 'google'
  | 'adzuna'
  | 'jooble'
  | 'talent'
  | 'rss'

export type SyndicationTarget = {
  id: SyndicationTargetId
  // Network name shown next to the checkbox
  label: string
  // One-line value prop the recruiter sees
  blurb: string
  // Where this network reads from
  feedUrl: string
  // Spec format (just for partner-page docs)
  spec: string
  // Default-on for new posts. We default everything on so the recruiter has
  // to actively opt out of distribution rather than opt in.
  defaultOn: boolean
  // Reach descriptor — informal, used in UI tooltips
  reach: string
}

export const SYNDICATION_TARGETS: SyndicationTarget[] = [
  {
    id: 'indeed',
    label: 'Indeed',
    blurb: 'Largest US job aggregator. Free organic posting.',
    feedUrl: 'https://freejobpost.co/feeds/indeed.xml',
    spec: 'Indeed v2 XML',
    defaultOn: true,
    reach: '~250M monthly visits',
  },
  {
    id: 'ziprecruiter',
    label: 'ZipRecruiter',
    blurb: 'Open Network — accepts the same Indeed-format feed.',
    feedUrl: 'https://freejobpost.co/feeds/ziprecruiter.xml',
    spec: 'Indeed v2 XML',
    defaultOn: true,
    reach: '~30M monthly visits',
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    blurb: 'Owned by Indeed; reads the same feed format.',
    feedUrl: 'https://freejobpost.co/feeds/glassdoor.xml',
    spec: 'Indeed v2 XML',
    defaultOn: true,
    reach: '~50M monthly visits',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Jobs',
    blurb: 'Limited Listings via Job Wrapping XML.',
    feedUrl: 'https://freejobpost.co/feeds/linkedin.xml',
    spec: 'LinkedIn Job Wrapping XML',
    defaultOn: true,
    reach: '~190M monthly visits',
  },
  {
    id: 'google',
    label: 'Google for Jobs',
    blurb: 'JobPosting JSON-LD on each /jobs/[slug] page.',
    feedUrl: 'https://freejobpost.co/jobs/[slug]',
    spec: 'schema.org JobPosting JSON-LD',
    defaultOn: true,
    reach: 'Google search results',
  },
  {
    id: 'adzuna',
    label: 'Adzuna',
    blurb: 'Crawl-ingested aggregator, US + intl. coverage.',
    feedUrl: 'https://freejobpost.co/feeds/adzuna.xml',
    spec: 'Adzuna XML',
    defaultOn: true,
    reach: '~25M monthly visits',
  },
  {
    id: 'jooble',
    label: 'Jooble',
    blurb: 'Global job aggregator, partner XML feed.',
    feedUrl: 'https://freejobpost.co/feeds/jooble.xml',
    spec: 'Jooble XML',
    defaultOn: true,
    reach: '~15M monthly visits',
  },
  {
    id: 'talent',
    label: 'Talent.com',
    blurb: 'Formerly Neuvoo; aggregator with strong allied-health reach.',
    feedUrl: 'https://freejobpost.co/feeds/talent.xml',
    spec: 'Talent.com XML',
    defaultOn: true,
    reach: '~30M monthly visits',
  },
  {
    id: 'rss',
    label: 'RSS / generic crawlers',
    blurb: 'For Apple News, Feedly, Reddit RSS bots, niche scrapers.',
    feedUrl: 'https://freejobpost.co/feeds/rss.xml',
    spec: 'RSS 2.0 with job extension fields',
    defaultOn: true,
    reach: 'Long-tail discovery',
  },
]

export const ALL_TARGET_IDS: SyndicationTargetId[] = SYNDICATION_TARGETS.map((t) => t.id)

export const DEFAULT_TARGET_IDS: SyndicationTargetId[] = SYNDICATION_TARGETS
  .filter((t) => t.defaultOn)
  .map((t) => t.id)

export function isKnownTarget(id: string): id is SyndicationTargetId {
  return ALL_TARGET_IDS.includes(id as SyndicationTargetId)
}
