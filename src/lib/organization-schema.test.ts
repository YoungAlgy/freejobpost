import { describe, expect, it } from 'vitest'
import { ORG_PROFILE, buildOrganizationGraph } from './organization-schema'

const FREEJOBPOST_INPUT = {
  websiteUrl: 'https://freejobpost.co',
  websiteName: 'Free Job Post',
  websiteDescription: 'Free healthcare job board.',
  organizationDescription: 'Ava Health Partners operates freejobpost.co.',
  searchActionTarget: 'https://freejobpost.co/jobs?q={search_term_string}',
} as const

describe('ORG_PROFILE (canonical)', () => {
  it('legalName matches Ava Health Partners LLC (entity legitimacy signal)', () => {
    // The strategic-plan disclosure norm depends on the legalName in the
    // schema graph — aggregator vetting reads this. Don't tweak without
    // reason.
    expect(ORG_PROFILE.legalName).toBe('Ava Health Partners LLC')
  })

  it('uses the canonical avahealth.co identity (not freejobpost or freeresumepost)', () => {
    expect(ORG_PROFILE['@id']).toBe('https://avahealth.co#organization')
    expect(ORG_PROFILE.url).toBe('https://avahealth.co')
  })

  it('phone is in international E.164 format (Google requirement)', () => {
    expect(ORG_PROFILE.telephone).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/)
  })

  it('postal address has all required fields (Google Maps + LocalBusiness reqs)', () => {
    expect(ORG_PROFILE.address.streetAddress).toBeTruthy()
    expect(ORG_PROFILE.address.addressLocality).toBeTruthy()
    expect(ORG_PROFILE.address.addressRegion).toBeTruthy()
    expect(ORG_PROFILE.address.postalCode).toMatch(/^\d{5}/)
    expect(ORG_PROFILE.address.addressCountry).toBe('US')
  })
})

describe('buildOrganizationGraph', () => {
  it('returns a schema.org @graph with exactly two entities (Organization + WebSite)', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph']).toHaveLength(2)
    const types = graph['@graph'].map((e) => e['@type'])
    expect(types).toContain('Organization')
    expect(types).toContain('WebSite')
  })

  it('Organization entry preserves canonical @id across all sites', () => {
    const a = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const b = buildOrganizationGraph({
      websiteUrl: 'https://www.freeresumepost.co',
      websiteName: 'Free Resume Post',
      websiteDescription: 'Free resume hosting.',
      organizationDescription: 'Operates freeresumepost.co.',
      searchActionTarget: 'https://www.freeresumepost.co/?q={search_term_string}',
    })
    const orgA = a['@graph'][0]
    const orgB = b['@graph'][0]
    // Both sites must point to the same Organization @id; that's what makes
    // Google merge them into one Knowledge Graph entity. Different sites,
    // same parent.
    expect(orgA['@id']).toBe(orgB['@id'])
    expect(orgA['@id']).toBe('https://avahealth.co#organization')
  })

  it('WebSite block uses per-site @id and url', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const website = graph['@graph'].find((e) => e['@type'] === 'WebSite')!
    expect(website['@id']).toBe('https://freejobpost.co#website')
    expect((website as { url: string }).url).toBe('https://freejobpost.co')
  })

  it('WebSite publisher links back to the Organization @id', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const website = graph['@graph'].find((e) => e['@type'] === 'WebSite') as {
      publisher: { '@id': string }
    }
    expect(website.publisher['@id']).toBe('https://avahealth.co#organization')
  })

  it('SearchAction target carries the per-site search URL template', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const website = graph['@graph'].find((e) => e['@type'] === 'WebSite') as {
      potentialAction: { target: string; 'query-input': string }
    }
    expect(website.potentialAction.target).toBe(FREEJOBPOST_INPUT.searchActionTarget)
    expect(website.potentialAction['query-input']).toBe('required name=search_term_string')
  })

  it('organizationDescription override flows through to the Organization entry', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const org = graph['@graph'][0] as { description: string }
    expect(org.description).toBe(FREEJOBPOST_INPUT.organizationDescription)
  })

  it('sameAs includes both freejobpost and freeresumepost (cross-site authority transfer)', () => {
    const graph = buildOrganizationGraph(FREEJOBPOST_INPUT)
    const org = graph['@graph'][0] as { sameAs: string[] }
    expect(org.sameAs).toContain('https://freejobpost.co')
    expect(org.sameAs).toContain('https://www.freeresumepost.co')
    expect(org.sameAs).toContain('https://avahealth.co')
  })

  it('additionalSameAs entries are appended to the base list, not replacing it', () => {
    const graph = buildOrganizationGraph({
      ...FREEJOBPOST_INPUT,
      additionalSameAs: ['https://twitter.com/freejobpost'],
    })
    const org = graph['@graph'][0] as { sameAs: string[] }
    expect(org.sameAs).toContain('https://twitter.com/freejobpost')
    // Base entries still present
    expect(org.sameAs).toContain('https://avahealth.co')
    expect(org.sameAs).toContain('https://freejobpost.co')
  })
})
