// Builds the JobPosting JSON-LD structured-data object for a single
// /jobs/[slug] page. Extracted from the page.tsx inline construction so
// it can be unit-tested + so a future regression (someone deletes a
// required Google property) gets caught by the test suite instead of
// surfacing as a Search Console error 1-7 days after deploy.
//
// Spec reference:
//   developers.google.com/search/docs/appearance/structured-data/job-posting
//
// Required fields per Google:
//   datePosted, description, hiringOrganization, jobLocation (or
//   jobLocationType:TELECOMMUTE + applicantLocationRequirements for
//   remote), title.
// Recommended fields we emit:
//   applicantLocationRequirements (when remote), baseSalary (when
//   salary set), directApply, employmentType, identifier,
//   jobLocationType (remote only), validThrough, experienceRequirements
//   (numeric leading char only).

import { mapToSchemaEmploymentType, usableSalary, type PublicJob } from './public-jobs'
import { stripSalarySuffix } from './clean-labels'

export interface EmployerSummary {
  name: string
  isSeeded: boolean
  slug: string | null
}

export interface BuildJobPostingArgs {
  job: PublicJob
  employer: EmployerSummary
}

/**
 * Build the JobPosting JSON-LD object Google reads to populate Google for
 * Jobs listings. Returns a plain Record so the caller can JSON.stringify +
 * safeJsonLd-escape it without further work. Never returns null — callers
 * are expected to gate emission on hasUsableDescription() and the
 * google-syndication-opt-in check (see /jobs/[slug]/page.tsx).
 */
export function buildJobPostingJsonLd(args: BuildJobPostingArgs): Record<string, unknown> {
  const { job, employer } = args
  const cleanJobTitle = stripSalarySuffix(job.title) || job.title
  const datePosted = job.created_at?.split('T')[0]
  const validThrough = job.expires_at
  // Floor placeholder/sub-$10K salaries (e.g. USAJobs GS-grade $1) so we never
  // emit baseSalary.minValue:1 to Google for Jobs. See usableSalary(). 2026-05-28.
  const salary = usableSalary(job.salary_min, job.salary_max)

  // Remote jobs: omit jobLocation; emit jobLocationType + applicantLocationRequirements.
  // Onsite/hybrid: emit jobLocation with city + state + country.
  const isRemote = job.remote_hybrid === 'remote'
  const locationBlock: Record<string, unknown> = isRemote
    ? {
        jobLocationType: 'TELECOMMUTE',
        applicantLocationRequirements: {
          '@type': 'Country',
          name: 'USA',
        },
      }
    : {
        jobLocation: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: job.city || undefined,
            addressRegion: job.state || undefined,
            addressCountry: 'US',
          },
        },
      }

  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: cleanJobTitle,
    description: job.description,
    datePosted,
    validThrough,
    identifier: {
      '@type': 'PropertyValue',
      name: 'freejobpost.co',
      value: job.slug,
    },
    hiringOrganization: {
      '@type': 'Organization',
      // Prefer the real per-job company (e.g. Adzuna's company.display_name) over
      // the joined meta-employer ("Adzuna (aggregator)"). When company_name
      // overrides, omit sameAs/logo — they describe the joined employer entity,
      // not the real hiring company, so linking them would be a content mismatch.
      name: job.company_name || employer.name,
      ...(job.company_name
        ? {}
        : employer.isSeeded
        ? { sameAs: 'https://avahealth.co', logo: 'https://avahealth.co/logo.png' }
        : employer.slug
        ? { sameAs: `https://freejobpost.co/employers/${employer.slug}` }
        : {}),
    },
    ...locationBlock,
    employmentType: mapToSchemaEmploymentType(job.employment_type),
    url: `https://freejobpost.co/jobs/${job.slug}`,
    directApply: false,
    ...(salary.min || salary.max
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'USD',
            // Google flags "Missing field value (in baseSalary.value)" when a
            // QuantitativeValue carries a lone minValue/maxValue and no `value`
            // (GSC WNC-10030322, 2026-06-11). A real range (both bounds) uses
            // minValue+maxValue; a single known figure uses `value`. Emitting a
            // one-sided min/max range is the incomplete shape Google rejects.
            value: {
              '@type': 'QuantitativeValue',
              ...(salary.min && salary.max
                ? { minValue: salary.min, maxValue: salary.max }
                : { value: (salary.min ?? salary.max) as number }),
              unitText: 'YEAR',
            },
          },
        }
      : {}),
    // experienceRequirements (BETA per Google spec). Emit only when the
    // leading character is numeric — free-text values risk content
    // mismatch with the rendered page.
    ...(job.experience_required && /^\d+/.test(job.experience_required)
      ? {
          experienceRequirements: {
            '@type': 'OccupationalExperienceRequirements',
            monthsOfExperience: Number.parseInt(job.experience_required, 10) * 12,
          },
        }
      : {}),
  }
}

/**
 * Validate a JobPosting JSON-LD object against Google's required-property
 * list. Returns an array of human-readable error messages — empty array
 * means valid. Used by the build-time test to catch regressions cheaply
 * without round-tripping through the Rich Results Test.
 *
 * Checks:
 *   - @context === 'https://schema.org'
 *   - @type === 'JobPosting'
 *   - title is a non-empty string
 *   - description is a non-empty string (gate on hasUsableDescription
 *     in the page; here we only check it's present)
 *   - datePosted is ISO 8601-ish
 *   - hiringOrganization has @type:Organization + name
 *   - jobLocation (with PostalAddress) OR (jobLocationType + applicantLocationRequirements)
 *
 * The validator is intentionally LENIENT on recommended fields — those
 * don't determine eligibility, just enrichment. We catch the cases that
 * would actually get the listing rejected from Google for Jobs.
 */
export function validateJobPostingJsonLd(obj: Record<string, unknown>): string[] {
  const errors: string[] = []

  if (obj['@context'] !== 'https://schema.org') {
    errors.push(`@context must be 'https://schema.org', got ${JSON.stringify(obj['@context'])}`)
  }
  if (obj['@type'] !== 'JobPosting') {
    errors.push(`@type must be 'JobPosting', got ${JSON.stringify(obj['@type'])}`)
  }
  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    errors.push('title must be a non-empty string')
  }
  if (typeof obj.description !== 'string' || obj.description.length === 0) {
    errors.push('description must be a non-empty string')
  }
  if (typeof obj.datePosted !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(obj.datePosted)) {
    errors.push('datePosted must be an ISO 8601-formatted string (YYYY-MM-DD prefix)')
  }

  // hiringOrganization
  const org = obj.hiringOrganization as Record<string, unknown> | undefined
  if (!org || org['@type'] !== 'Organization') {
    errors.push('hiringOrganization must have @type:Organization')
  } else if (typeof org.name !== 'string' || org.name.trim().length === 0) {
    errors.push('hiringOrganization.name must be a non-empty string')
  }

  // Location: either jobLocation (with PostalAddress) OR
  // jobLocationType:TELECOMMUTE + applicantLocationRequirements
  const hasJobLocation = obj.jobLocation !== undefined
  const isTelecommute = obj.jobLocationType === 'TELECOMMUTE'
  if (hasJobLocation && isTelecommute) {
    errors.push('jobLocation MUST NOT be present when jobLocationType is TELECOMMUTE (content-mismatch risk)')
  }
  if (!hasJobLocation && !isTelecommute) {
    errors.push('one of jobLocation (onsite/hybrid) or jobLocationType:TELECOMMUTE (remote) must be present')
  }
  if (isTelecommute && obj.applicantLocationRequirements === undefined) {
    errors.push('remote jobs (jobLocationType:TELECOMMUTE) must include applicantLocationRequirements')
  }
  if (hasJobLocation) {
    const loc = obj.jobLocation as Record<string, unknown>
    if (loc['@type'] !== 'Place') {
      errors.push('jobLocation must have @type:Place')
    } else {
      const addr = loc.address as Record<string, unknown> | undefined
      if (!addr || addr['@type'] !== 'PostalAddress') {
        errors.push('jobLocation.address must have @type:PostalAddress')
      } else if (typeof addr.addressCountry !== 'string') {
        errors.push('jobLocation.address.addressCountry must be a string (we always emit "US")')
      }
    }
  }

  return errors
}
