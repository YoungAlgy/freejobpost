import { describe, expect, it } from 'vitest'
import { stripSalarySuffix } from './clean-labels'

describe('stripSalarySuffix', () => {
  it('strips the documented salary/bonus suffixes', () => {
    // These are the examples from the file's own doc block. They double as a
    // contract: this helper is the display-time guard against leaking salary
    // and sign-on-bonus amounts into candidate-facing labels.
    expect(stripSalarySuffix('Interventional Pain Physician – $550K')).toBe(
      'Interventional Pain Physician',
    )
    expect(stripSalarySuffix('Mohs Surgeon - $700K plus productivity bonus')).toBe('Mohs Surgeon')
    expect(stripSalarySuffix('RN ICU - $18,900 Hiring Incentives')).toBe('RN ICU')
    expect(stripSalarySuffix('Cardiac Nurse - (RN - Step Down) - $12,400 Sign On Bonus')).toBe(
      'Cardiac Nurse - (RN - Step Down)',
    )
    expect(stripSalarySuffix('Nurse Practitioner - $115K-$130K Negotiable!')).toBe(
      'Nurse Practitioner',
    )
    expect(stripSalarySuffix('Dermatologist - Up to $700K (First Year Guarantee)')).toBe(
      'Dermatologist',
    )
  })

  it('triggers on a cue word even without a dollar sign', () => {
    expect(stripSalarySuffix('Hospitalist - Sign On Bonus')).toBe('Hospitalist')
    expect(stripSalarySuffix('Med Surg RN - Hiring Incentive')).toBe('Med Surg RN')
  })

  it('matches the Sign-On / SignOn spelling variants', () => {
    expect(stripSalarySuffix('Surgeon - Sign-On Bonus $50K')).toBe('Surgeon')
    expect(stripSalarySuffix('Surgeon - SignOn Bonus')).toBe('Surgeon')
  })

  it('preserves plain hyphenated names with no salary cue', () => {
    expect(stripSalarySuffix('Family Medicine - Outpatient')).toBe('Family Medicine - Outpatient')
    expect(stripSalarySuffix('Cardiac Nurse - (RN - Step Down)')).toBe('Cardiac Nurse - (RN - Step Down)')
    expect(stripSalarySuffix('Nurse Practitioner')).toBe('Nurse Practitioner')
  })

  it('handles null, undefined, and empty input', () => {
    expect(stripSalarySuffix(null)).toBe('')
    expect(stripSalarySuffix(undefined)).toBe('')
    expect(stripSalarySuffix('')).toBe('')
  })

  it('trims surrounding whitespace from the cleaned label', () => {
    expect(stripSalarySuffix('  RN ICU - $18,900  ')).toBe('RN ICU')
  })
})
