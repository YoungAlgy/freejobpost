import { describe, expect, it } from 'vitest'
import { isHealthcareRelevant } from './healthcare-filter'

describe('isHealthcareRelevant', () => {
  it.each([
    'Registered Nurse',
    'Staff Physician',
    'Physical Therapist',
    'Pharmacy Technician',
    'Phlebotomist',
    'Certified Nursing Assistant',
    'Care Coordinator',
    'Medical Biller',
    'Respiratory Therapist',
    'MRI Technologist',
    'ICU Nurse',
    'Family Medicine DO', // the DO credential
    // Stem-match roles that a trailing word-boundary bug used to drop
    // ("Phlebotomist" above is one; these exercise the rest of the fix):
    'Phlebotomy Technician',
    'Social Worker',
    'Occupational Therapy Assistant',
    'Physical Therapy Aide',
  ])('keeps the clinical role %j', (title) => {
    expect(isHealthcareRelevant(title)).toBe(true)
  })

  it.each([
    'Software Engineer',
    'Marketing Manager',
    'Financial Analyst',
    'Warehouse Associate',
    'Graphic Designer',
  ])('drops the non-clinical role %j', (title) => {
    expect(isHealthcareRelevant(title)).toBe(false)
  })

  it('also scans the department field', () => {
    expect(isHealthcareRelevant('Coordinator', 'Nursing')).toBe(true)
    expect(isHealthcareRelevant('Analyst', 'Engineering')).toBe(false)
    expect(isHealthcareRelevant('Coordinator', null)).toBe(false)
    expect(isHealthcareRelevant('Coordinator')).toBe(false)
  })

  describe('word-boundary and lookahead guards (avoid false positives)', () => {
    it('does not match "rn" inside another word like "turn"', () => {
      expect(isHealthcareRelevant('Turnaround Manager')).toBe(false)
    })
    it('does not treat "do not" as the DO credential', () => {
      expect(isHealthcareRelevant('Cashier (we do not require experience)')).toBe(false)
    })
  })
})
