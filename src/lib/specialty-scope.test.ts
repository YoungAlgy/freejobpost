import { describe, expect, it } from 'vitest'
import { validateSpecialtyScope } from './specialty-scope'

describe('validateSpecialtyScope', () => {
  it.each([
    ['Family Medicine Physician', 'Physician', ''],
    ['Interventional Cardiologist', 'Cardiologist', 'Cardiology'],
    ['Board Certified Surgeon', 'Surgeon', ''],
    ['Orthopedic Surgery Physician Assistant', 'Physician Assistant', ''],
    ['Orthopedic PA-C', 'PA-C', ''],
    ['Hospitalist', 'Family Medicine MD', ''],
    ['Primary Care', 'Internal Medicine DO', ''],
    ['Radiologist', 'Radiologist', 'Radiology'],
    ['Anesthesiologist', 'Anesthesiologist', ''],
    ['Psychiatrist', 'Psychiatrist', ''],
    ['OB/GYN', 'Obstetrician', ''],
    ['Pediatrician', 'Pediatrician', ''],
    ['Regional Medical Director', 'Medical Director', ''],
    ['Medical Director', 'Medical Director', 'Cardiology'],
    // A real physician-role posting must still reject even when it also
    // mentions the "Physician-Owned" business descriptor elsewhere.
    ['Physician', 'Physician-Owned Group Practice', ''],
  ])('rejects a physician/PA posting (title=%s, role=%s, specialty=%s)', (title, role, specialty) => {
    expect(validateSpecialtyScope(title, role, specialty)).not.toBeNull()
  })

  it.each([
    ['ICU Registered Nurse', 'RN', ''],
    ['Family Nurse Practitioner', 'NP', 'Primary Care'],
    ['Anesthesia CRNA', 'CRNA', ''],
    ['Hospitalist NP', 'Nurse Practitioner', 'Hospitalist'],
    ['Radiologic Technologist', 'Rad Tech', 'Radiology'],
    ['Orthopedic Surgical Technologist', 'Surgical Tech', ''],
    ['Outpatient Physical Therapist', 'PT', 'Physical Therapy'],
    ['Medical Assistant', 'MA', 'Primary Care'],
    ['Doctor of Physical Therapy', 'DPT', ''],
    ['Family Medicine Nurse Practitioner', 'NP', 'Family Medicine'],
    ['RN, MDS Coordinator', 'RN', 'Long-Term Care'], // "MDS" must not false-positive on the MD pattern
    ['RN - MD Anderson Cancer Center - Oncology Infusion', 'RN', 'Oncology'], // "MD Anderson" facility name must not false-positive on the MD pattern
    ['ICU Registered Nurse, Baltimore, MD', 'RN', ''], // Maryland state abbreviation in the title must not false-positive on the MD pattern
    // "Physician-Owned"/"Physician Owned" describes the EMPLOYER's ownership
    // structure, not the role being hired for — must not false-positive on
    // the bare \bphysicians?\b pattern (a hyphen is a word boundary).
    ['RN — Physician-Owned Private Practice', 'RN', ''],
    ['Nurse Practitioner - Physician Owned Group Practice', 'NP', 'Primary Care'],
    // "Director" titles that are NOT "Medical Director" must stay allowed —
    // these are nurse-led department titles, unlike a physician-role title.
    ['Director of Nursing', 'Director of Nursing', ''],
    ['Clinical Director', 'RN', 'Med-Surg'],
  ])('does not reject a nurse/allied posting (title=%s, role=%s, specialty=%s)', (title, role, specialty) => {
    expect(validateSpecialtyScope(title, role, specialty)).toBeNull()
  })

  it('returns null when all fields are empty', () => {
    expect(validateSpecialtyScope('', '', '')).toBeNull()
    expect(validateSpecialtyScope(null, undefined, null)).toBeNull()
  })
})
