// Maps URL-friendly slugs to canonical specialty / role values for the
// /specialty/[slug] hub pages. Specialty data on public_jobs is free-text
// (sometimes "Cardiology", sometimes "Cardiovascular Disease", etc.) so
// each slug holds a list of acceptable values for ILIKE matching.

export type SpecialtyHub = {
  slug: string
  title: string           // h1 + meta title prefix
  metaDescription: string // 150-160 chars
  shortDescription: string // for the page lede
  // ILIKE patterns matched against public_jobs.specialty + public_jobs.title + public_jobs.role
  matchPatterns: string[]
}

export const SPECIALTY_HUBS: SpecialtyHub[] = [
  {
    slug: 'cardiology',
    title: 'Cardiology Jobs',
    metaDescription: 'Free cardiology jobs — interventional, EP, structural, general. Browse open roles, apply directly, no account required, no recruiter spam.',
    shortDescription: 'Cardiology openings across general, interventional, EP, and structural-heart subspecialties. All postings come straight from the hiring employer.',
    matchPatterns: ['cardio', 'cardiov', 'interventional cardio', 'electrophys', 'structural heart'],
  },
  {
    slug: 'orthopedic-surgery',
    title: 'Orthopedic Surgery Jobs',
    metaDescription: 'Free orthopedic surgery jobs — joint replacement, sports medicine, spine, trauma. Browse open roles from US hospitals + private groups.',
    shortDescription: 'Orthopedic surgery roles including arthroplasty, sports medicine, spine, hand, foot/ankle, and trauma practices.',
    matchPatterns: ['ortho', 'orthopedic'],
  },
  {
    slug: 'family-medicine',
    title: 'Family Medicine Jobs',
    metaDescription: 'Free family medicine + primary care jobs from US healthcare employers. Outpatient, inpatient, telehealth, urgent care. Apply directly.',
    shortDescription: 'Family medicine and primary care roles spanning outpatient clinics, multi-specialty groups, FQHCs, urgent care, and telehealth.',
    matchPatterns: ['family medicine', 'primary care', 'family practice'],
  },
  {
    slug: 'internal-medicine',
    title: 'Internal Medicine Jobs',
    metaDescription: 'Free internal medicine jobs — outpatient, inpatient hospitalist, subspecialty. Browse roles from hospital systems and private groups.',
    shortDescription: 'Internal medicine roles ranging from outpatient practice to hospitalist medicine and IM subspecialties.',
    matchPatterns: ['internal medicine'],
  },
  {
    slug: 'hospitalist',
    title: 'Hospitalist Jobs',
    metaDescription: 'Free hospitalist jobs — 7-on/7-off, nocturnist, swing-shift. Open roles from US hospital systems. Free to browse, free to apply.',
    shortDescription: 'Hospitalist roles including 7-on/7-off blocks, nocturnist, swing-shift, and academic hybrid coverage models.',
    matchPatterns: ['hospitalist', 'hospital medicine'],
  },
  {
    slug: 'emergency-medicine',
    title: 'Emergency Medicine Jobs',
    metaDescription: 'Free emergency medicine jobs from US hospitals + freestanding EDs. Day, night, swing shifts. Apply directly, no account needed.',
    shortDescription: 'Emergency medicine roles in level-I trauma centers, community hospitals, and freestanding emergency departments.',
    matchPatterns: ['emergency medicine', 'emergency department', 'trauma'],
  },
  {
    slug: 'anesthesiology',
    title: 'Anesthesiology Jobs',
    metaDescription: 'Free anesthesiology jobs — general OR, cardiac, pediatric, regional, pain. Hospital + ASC roles. Browse open positions from US employers.',
    shortDescription: 'Anesthesiology roles including general OR, cardiac, pediatric, regional, OB, and chronic pain.',
    matchPatterns: ['anesthesiology', 'anesthes'],
  },
  {
    slug: 'radiology',
    title: 'Radiology Jobs',
    metaDescription: 'Free radiology jobs — diagnostic, interventional, breast, neuro, MSK. Teleradiology + onsite. Apply directly to the hiring practice, no recruiter spam.',
    shortDescription: 'Radiology roles including diagnostic, interventional, breast imaging, neuro, MSK, and teleradiology.',
    matchPatterns: ['radiology'],
  },
  {
    slug: 'psychiatry',
    title: 'Psychiatry Jobs',
    metaDescription: 'Free psychiatry jobs — outpatient, inpatient, telepsychiatry, addiction, child/adolescent. Browse open roles, apply directly, no recruiter spam.',
    shortDescription: 'Psychiatry roles spanning outpatient, inpatient, telepsychiatry, addiction medicine, and child + adolescent.',
    matchPatterns: ['psychiatry', 'psychiatric', 'psych'],
  },
  {
    slug: 'dermatology',
    title: 'Dermatology Jobs',
    metaDescription: 'Free dermatology jobs — medical derm, MOHS, cosmetic, pediatric. Private practice + hospital openings from US employers.',
    shortDescription: 'Dermatology roles including general medical derm, MOHS micrographic surgery, cosmetic, and pediatric.',
    matchPatterns: ['dermatology'],
  },
  {
    slug: 'gastroenterology',
    title: 'Gastroenterology Jobs',
    metaDescription: 'Free gastroenterology jobs — outpatient, hospital-based, advanced endoscopy, hepatology. Browse open roles, apply directly, no recruiter spam.',
    shortDescription: 'Gastroenterology roles including outpatient, hospital-based, advanced endoscopy (ERCP, EUS), and hepatology.',
    matchPatterns: ['gastroenterology', 'gastro', 'hepatology'],
  },
  {
    slug: 'pediatrics',
    title: 'Pediatrics Jobs',
    metaDescription: 'Free pediatric jobs — general peds, hospitalist, urgent care, subspecialty. Browse open roles from US healthcare employers.',
    shortDescription: 'Pediatrics roles in general practice, hospitalist medicine, urgent care, and subspecialty.',
    matchPatterns: ['pediatric'],
  },
  {
    slug: 'obgyn',
    title: 'OB/GYN Jobs',
    metaDescription: 'Free OB/GYN jobs — generalist, MFM, gyn-onc, REI, urogynecology. Browse open roles from US hospitals + private groups.',
    shortDescription: 'OB/GYN roles including generalist, maternal-fetal medicine, gynecologic oncology, REI, and urogynecology.',
    matchPatterns: ['obstetric', 'gynec', 'obgyn', 'ob/gyn'],
  },
  {
    slug: 'crna',
    title: 'CRNA Jobs',
    metaDescription: 'Free CRNA jobs — hospital, ASC, autonomous practice. Permanent + locum. Apply directly to the hiring practice, no recruiter spam.',
    shortDescription: 'Certified Registered Nurse Anesthetist roles in hospital, ASC, and autonomous-practice settings.',
    matchPatterns: ['crna', 'nurse anesthet', 'certified registered nurse anesthet'],
  },
  {
    slug: 'nurse-practitioner',
    title: 'Nurse Practitioner Jobs',
    metaDescription: 'Free NP jobs — primary care, hospitalist, EM, psych, specialty. FNP, AGNP, PMHNP, ACNP. Browse open roles from US employers.',
    shortDescription: 'Nurse Practitioner roles spanning FNP, AGNP, PMHNP, ACNP, and specialty NP across primary care, hospitalist, EM, and inpatient settings.',
    matchPatterns: ['nurse practitioner', 'np ', 'fnp', 'agnp', 'pmhnp', 'acnp'],
  },
  {
    slug: 'physician-assistant',
    title: 'Physician Assistant Jobs',
    metaDescription: 'Free PA jobs — surgical, emergency, primary care, dermatology, orthopedic. Browse open roles from US healthcare employers.',
    shortDescription: 'Physician Assistant roles in surgical, emergency, primary care, dermatology, orthopedic, and other specialties.',
    matchPatterns: ['physician assistant', 'pa-c'],
  },
  {
    slug: 'rn',
    title: 'Registered Nurse Jobs',
    metaDescription: 'Free RN jobs — ICU, ER, OR, L&D, Cath Lab, telemetry, med-surg. Travel + permanent. Browse open roles from US healthcare employers.',
    shortDescription: 'Registered Nurse roles across ICU, ER, OR, Labor & Delivery, Cath Lab, telemetry, med-surg, and specialty units.',
    matchPatterns: ['registered nurse', 'rn ', ' rn', 'icu nurse', 'er nurse', 'critical care nurse'],
  },
  {
    slug: 'pharmacist',
    title: 'Pharmacist Jobs',
    metaDescription: 'Free pharmacist jobs — hospital, retail, specialty, ambulatory. Browse open pharmacist + PharmD roles, apply directly, no recruiter spam.',
    shortDescription: 'Pharmacist + PharmD roles in hospital, retail, specialty, and ambulatory care.',
    matchPatterns: ['pharmacist', 'pharmd'],
  },
]

export function getSpecialtyHub(slug: string): SpecialtyHub | undefined {
  return SPECIALTY_HUBS.find((s) => s.slug === slug)
}
