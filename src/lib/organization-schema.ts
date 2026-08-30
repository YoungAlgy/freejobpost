// FreeJobPost's independent Organization + WebSite JSON-LD identity.

import {
  FREEJOBPOST_SUPPORT_EMAIL_BINDING,
  requireFreeJobPostOwnedEmail,
} from '../../supabase/functions/_shared/freejobpost-email'

export const ORG_PROFILE = {
  '@type': 'Organization' as const,
  '@id': 'https://freejobpost.co#organization',
  name: 'FreeJobPost',
  alternateName: 'Free Job Post',
  url: 'https://freejobpost.co',
  logo: 'https://freejobpost.co/icon-512',
  telephone: '+1-904-343-9449',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '4532 W Kennedy Blvd Suite 125',
    addressLocality: 'Tampa',
    addressRegion: 'FL',
    postalCode: '33609',
    addressCountry: 'US',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '17:00',
    },
  ],
  areaServed: { '@type': 'Country', name: 'United States' },
  industry: 'Healthcare job board',
} as const

export type SiteSchemaInput = {
  /** Canonical URL (no trailing slash) — used for WebSite @id + url */
  websiteUrl: string
  /** Display name for the WebSite block */
  websiteName: string
  /** One-sentence WebSite description */
  websiteDescription: string
  /** Description of the FreeJobPost product */
  organizationDescription: string
  /** Monitored public contact address owned by FreeJobPost */
  supportEmail: string
  /** Target for the sitelinks search box */
  searchActionTarget: string
}

/**
 * Builds the @graph payload combining the FreeJobPost Organization and WebSite
 * blocks. Drop the result into a `<script type="application/ld+json">`
 * tag in the root layout.
 */
export function buildOrganizationGraph(input: SiteSchemaInput) {
  const supportEmail = requireFreeJobPostOwnedEmail(
    input.supportEmail,
    FREEJOBPOST_SUPPORT_EMAIL_BINDING,
  )

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        ...ORG_PROFILE,
        description: input.organizationDescription,
        email: supportEmail,
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            telephone: ORG_PROFILE.telephone,
            email: supportEmail,
            areaServed: 'US',
            availableLanguage: 'English',
          },
        ],
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
