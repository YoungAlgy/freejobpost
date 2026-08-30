import { describe, expect, it } from 'vitest'
import { ORG_PROFILE, buildOrganizationGraph } from './organization-schema'

const FREEJOBPOST_INPUT = {
  websiteUrl: 'https://freejobpost.co',
  websiteName: 'FreeJobPost',
  websiteDescription: 'Free nursing and allied-health job board.',
  organizationDescription:
    'FreeJobPost is an independent nursing and allied-health job board.',
  supportEmail: 'support@freejobpost.co',
  searchActionTarget: 'https://freejobpost.co/jobs?q={search_term_string}',
} as const

describe('ORG_PROFILE', () => {
  it('uses FreeJobPost as the canonical public identity', () => {
    expect(ORG_PROFILE['@id']).toBe('https://freejobpost.co#organization')
    expect(ORG_PROFILE.name).toBe('FreeJobPost')
    expect(ORG_PROFILE.url).toBe('https://freejobpost.co')
    expect(ORG_PROFILE.logo).toBe('https://freejobpost.co/icon-512')
  })

  it('does not connect the public product graph to another brand', () => {
    expect(ORG_PROFILE).not.toHaveProperty('parentOrganization')
    expect(JSON.stringify(ORG_PROFILE)).not.toMatch(/ava health/i)
  })

  it('keeps complete operator contact details', () => {
    expect(ORG_PROFILE.telephone).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/)
    expect(ORG_PROFILE.address.streetAddress).toBeTruthy()
    expect(ORG_PROFILE.address.addressLocality).toBeTruthy()
    expect(ORG_PROFILE.address.addressRegion).toBeTruthy()
    expect(ORG_PROFILE.address.postalCode).toMatch(/^\d{5}/)
    expect(ORG_PROFILE.address.addressCountry).toBe('US')
  })

  it('keeps contact email out of the static profile', () => {
    expect(ORG_PROFILE).not.toHaveProperty('email')
    expect(ORG_PROFILE).not.toHaveProperty('contactPoint')
  })
})

describe('buildOrganizationGraph', () => {
  it('returns an Organization and WebSite graph', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph']).toHaveLength(2)
    expect(graph['@graph'].map((entry) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
    ])
  })

  it('links the FreeJobPost WebSite to the FreeJobPost Organization', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const website = graph['@graph'][1]
    expect(website['@id']).toBe('https://freejobpost.co#website')
    expect(website.url).toBe('https://freejobpost.co')
    expect(website.publisher).toEqual({
      '@id': 'https://freejobpost.co#organization',
    })
  })

  it('does not claim unverified social or product identities', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const organization = graph['@graph'][0] as { sameAs?: string[] }
    expect(organization.sameAs).toBeUndefined()
  })

  it('keeps the provided product description and search target', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    expect(graph['@graph'][0].description).toBe(
      FREEJOBPOST_INPUT.organizationDescription,
    )
    expect(graph['@graph'][1].potentialAction).toMatchObject({
      target: FREEJOBPOST_INPUT.searchActionTarget,
      'query-input': 'required name=search_term_string',
    })
  })

  it('uses the required FreeJobPost-owned support address', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const organization = graph['@graph'][0] as {
      email: string
      contactPoint: Array<{ email: string }>
    }
    expect(organization.email).toBe(FREEJOBPOST_INPUT.supportEmail)
    expect(organization.contactPoint[0].email).toBe(
      FREEJOBPOST_INPUT.supportEmail,
    )
  })

  it('fails closed on a cross-brand support address', () => {
    expect(() =>
      buildOrganizationGraph({
        ...FREEJOBPOST_INPUT,
        supportEmail: 'info@avahealth.co',
      }),
    ).toThrow('NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL')
  })
})
