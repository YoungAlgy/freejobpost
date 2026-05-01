// Organization + WebSite JSON-LD for freejobpost.co + freeresumepost.co.
//
// THIS FILE IS MIRRORED ACROSS REPOS. Both freejobpost/src/lib/organization-schema.ts
// and freeresumepost/src/lib/organization-schema.ts must stay byte-identical
// for the `Organization` block — the only thing that legitimately diverges
// per-site is the `WebSite` block (different `@id`, `url`, `name`, `description`).
//
// When you change anything in `buildOrganizationGraph` or `ORG_PROFILE`, mirror
// the change to the sister repo in the same commit. Drift here means Google
// Knowledge Graph treats the two sites as describing different parent
// organizations, which fragments brand authority.
//
// Reason this isn't a shared npm package: 60 lines of static data isn't worth
// the workspace tooling cost (Vercel + Next 16 deployment is per-repo).
// Reason this isn't `fetch()`-imported: schema is rendered server-side at build
// and must not depend on runtime network availability.

export const ORG_PROFILE = {
  '@type': 'Organization' as const,
  '@id': 'https://avahealth.co#organization',
  legalName: 'Ava Health Partners LLC',
  name: 'Ava Health',
  alternateName: ['Ava Health Partners', 'Ava Health Partners LLC'],
  url: 'https://avahealth.co',
  logo: 'https://avahealth.co/logo.png',
  telephone: '+1-904-343-9449',
  email: 'info@avahealth.co',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '1314 7th Street South',
    addressLocality: 'St. Petersburg',
    addressRegion: 'FL',
    postalCode: '33701',
    addressCountry: 'US',
  },
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: '+1-904-343-9449',
      email: 'info@avahealth.co',
      areaServed: 'US',
      availableLanguage: 'English',
    },
  ],
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '17:00',
    },
  ],
  areaServed: { '@type': 'Country', name: 'United States' },
  industry: 'Staffing and Recruiting',
  naics: '561311',
} as const

const BASE_SAME_AS = [
  'https://avahealth.co',
  'https://www.avahealth.co',
  'https://providers.avahealth.co',
  'https://app.avahealth.co',
  'https://freejobpost.co',
  'https://www.freeresumepost.co',
  'https://www.linkedin.com/company/ava-health1/',
]

export type SiteSchemaInput = {
  /** Canonical URL (no trailing slash) — used for WebSite @id + url */
  websiteUrl: string
  /** Display name for the WebSite block (e.g. "Free Job Post") */
  websiteName: string
  /** One-sentence WebSite description */
  websiteDescription: string
  /** Org-level description biased toward the operating site (e.g. mentions freejobpost.co) */
  organizationDescription: string
  /** Per-site target for the sitelinks search box (e.g. "https://freejobpost.co/jobs?q={search_term_string}") */
  searchActionTarget: string
  /** Additional sameAs entries unique to this site (e.g. the per-site LinkedIn page) */
  additionalSameAs?: readonly string[]
}

/**
 * Builds the @graph payload combining the canonical Organization block with
 * the per-site WebSite block. Drop the result into a `<script type="application/ld+json">`
 * tag in the root layout.
 */
export function buildOrganizationGraph(input: SiteSchemaInput) {
  const sameAs = [...BASE_SAME_AS, ...(input.additionalSameAs ?? [])]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...ORG_PROFILE,
        description: input.organizationDescription,
        sameAs,
      },
      {
        '@type': 'WebSite',
        '@id': `${input.websiteUrl}#website`,
        url: input.websiteUrl,
        name: input.websiteName,
        description: input.websiteDescription,
        publisher: { '@id': ORG_PROFILE['@id'] },
        potentialAction: {
          '@type': 'SearchAction',
          target: input.searchActionTarget,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  }
}
