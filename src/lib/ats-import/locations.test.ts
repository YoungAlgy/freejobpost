import { describe, expect, it } from 'vitest'
import { parseUsLocation } from './locations'

describe('parseUsLocation', () => {
  it('returns a non-US empty result for blank input', () => {
    expect(parseUsLocation('')).toEqual({ us: false, city: null, state: null, remote: false })
    expect(parseUsLocation(null)).toEqual({ us: false, city: null, state: null, remote: false })
    expect(parseUsLocation(undefined)).toEqual({ us: false, city: null, state: null, remote: false })
  })

  describe('remote (treated as US-remote by convention)', () => {
    it.each(['Remote', 'remote', 'Anywhere', 'Worldwide', '(Remote)', 'Remote - US', 'Remote, USA'])(
      'treats %j as US-remote with no city/state',
      (raw) => {
        expect(parseUsLocation(raw)).toEqual({ us: true, city: null, state: null, remote: true })
      },
    )
  })

  describe('non-US locations are rejected', () => {
    it.each(['London, UK', 'Toronto, Canada', 'India', 'Tokyo', 'Berlin, Germany', 'EMEA'])(
      'rejects %j',
      (raw) => {
        expect(parseUsLocation(raw)).toEqual({ us: false, city: null, state: null, remote: false })
      },
    )
  })

  describe('US city + state', () => {
    it('parses the Greenhouse "City, State, United States" format', () => {
      expect(parseUsLocation('New York, New York, United States')).toEqual({
        us: true,
        city: 'New York',
        state: 'NY',
        remote: false,
      })
      expect(parseUsLocation('Tempe, Arizona, United States')).toEqual({
        us: true,
        city: 'Tempe',
        state: 'AZ',
        remote: false,
      })
    })

    it('parses the Lever "City, ST" abbreviation format', () => {
      expect(parseUsLocation('New York, NY')).toEqual({
        us: true,
        city: 'New York',
        state: 'NY',
        remote: false,
      })
    })

    it('trims a trailing USA/US suffix', () => {
      expect(parseUsLocation('Dallas, TX, USA')).toEqual({
        us: true,
        city: 'Dallas',
        state: 'TX',
        remote: false,
      })
    })

    it('keeps city/state on a "City, ST (Remote)" suffix and marks it remote', () => {
      expect(parseUsLocation('Austin, TX (Remote)')).toEqual({
        us: true,
        city: 'Austin',
        state: 'TX',
        remote: true,
      })
      expect(parseUsLocation('New York, NY (Remote)')).toEqual({
        us: true,
        city: 'New York',
        state: 'NY',
        remote: true,
      })
    })

    it('treats "United States (Remote)" / "US (Remote)" as generic US-remote', () => {
      expect(parseUsLocation('United States (Remote)')).toEqual({
        us: true,
        city: null,
        state: null,
        remote: true,
      })
      expect(parseUsLocation('US (Remote)')).toEqual({
        us: true,
        city: null,
        state: null,
        remote: true,
      })
    })
  })

  describe('state-only and territories', () => {
    it('parses a bare state name to its abbreviation with no city', () => {
      expect(parseUsLocation('Texas')).toEqual({ us: true, city: null, state: 'TX', remote: false })
      expect(parseUsLocation('California')).toEqual({ us: true, city: null, state: 'CA', remote: false })
    })
    it('handles DC and Puerto Rico', () => {
      expect(parseUsLocation('Washington, DC')).toEqual({
        us: true,
        city: 'Washington',
        state: 'DC',
        remote: false,
      })
      expect(parseUsLocation('Puerto Rico')).toEqual({
        us: true,
        city: null,
        state: 'PR',
        remote: false,
      })
    })
  })

  it('drops a bare city with no resolvable state (drop rather than mis-state)', () => {
    expect(parseUsLocation('San Francisco')).toEqual({
      us: false,
      city: null,
      state: null,
      remote: false,
    })
  })
})
