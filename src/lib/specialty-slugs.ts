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
    slug: 'crna',
    title: 'CRNA Jobs',
    metaDescription: 'Free CRNA jobs, hospital, ASC, autonomous practice. Permanent + locum. Apply directly to the hiring practice, no recruiter spam.',
    shortDescription: 'Certified Registered Nurse Anesthetist roles in hospital, ASC, and autonomous-practice settings.',
    matchPatterns: ['crna', 'nurse anesthet', 'certified registered nurse anesthet'],
  },
  {
    slug: 'nurse-practitioner',
    title: 'Nurse Practitioner Jobs',
    metaDescription: 'Free NP jobs, primary care, hospitalist, EM, psych, specialty. FNP, AGNP, PMHNP, ACNP. Browse open roles, apply directly, no account required.',
    shortDescription: 'Nurse Practitioner roles spanning FNP, AGNP, PMHNP, ACNP, and specialty NP across primary care, hospitalist, EM, and inpatient settings.',
    matchPatterns: ['nurse practitioner', 'np ', 'fnp', 'agnp', 'pmhnp', 'acnp'],
  },
  {
    // 2026-05-13: slug renamed from 'rn' → 'registered-nurse' to match search
    // intent (full word has higher monthly volume) and align with sister-site
    // freeresumepost.co/specialty/registered-nurse. 301 from /specialty/rn is
    // configured in next.config.ts.
    slug: 'registered-nurse',
    title: 'Registered Nurse Jobs',
    metaDescription: 'Free RN jobs, ICU, ER, OR, L&D, Cath Lab, telemetry, med-surg. Travel + permanent. Browse open roles, apply directly, no account required.',
    shortDescription: 'Registered Nurse roles across ICU, ER, OR, Labor & Delivery, Cath Lab, telemetry, med-surg, and specialty units.',
    matchPatterns: ['registered nurse', 'rn ', ' rn', 'icu nurse', 'er nurse', 'critical care nurse'],
  },
  {
    slug: 'pharmacist',
    title: 'Pharmacist Jobs',
    metaDescription: 'Free pharmacist jobs, hospital, retail, specialty, ambulatory. Browse open pharmacist + PharmD roles, apply directly, no recruiter spam.',
    shortDescription: 'Pharmacist + PharmD roles in hospital, retail, specialty, and ambulatory care.',
    matchPatterns: ['pharmacist', 'pharmd'],
  },
  // Volume-allied roles added 2026-05-21 alongside the matching
  // /become/[slug] career-path guides. Match patterns use multi-word
  // anchors where the abbreviation alone is too short / ambiguous to
  // be safe (e.g. 'pt' would false-positive on every Patient Transport
  // role; 'ma' would false-positive on Manager).
  {
    slug: 'lpn',
    title: 'LPN / LVN Jobs',
    metaDescription: 'Free LPN + LVN jobs, long-term care, skilled nursing, clinics, home health, hospitals. Apply directly, no recruiter spam.',
    shortDescription: 'Licensed Practical Nurse + Licensed Vocational Nurse roles across long-term care, SNF, clinics, home health, and hospital med-surg.',
    matchPatterns: ['lpn', 'lvn', 'licensed practical', 'licensed vocational'],
  },
  {
    slug: 'cna',
    title: 'CNA + Nursing Assistant Jobs',
    metaDescription: 'Free CNA + nursing-assistant jobs, long-term care, hospitals, home health. Entry-level pathway into healthcare. Apply free.',
    shortDescription: 'Certified Nursing Assistant + nursing-aide roles in long-term care, skilled nursing, hospitals, and home health agencies.',
    matchPatterns: ['cna', 'certified nursing assistant', 'nursing assistant', 'nursing aide', 'patient care assistant', 'patient care tech'],
  },
  {
    slug: 'physical-therapy',
    title: 'Physical Therapy Jobs',
    metaDescription: 'Free physical therapy jobs, outpatient ortho, acute care, home health, SNF. DPT, PT, and PTA roles. Apply free, no recruiter spam.',
    shortDescription: 'Physical Therapist (DPT/PT) + Physical Therapist Assistant (PTA) roles across outpatient orthopedic, acute-care hospital, home health, and skilled-nursing settings.',
    matchPatterns: ['physical therap', 'physiotherapist', 'dpt ', ' dpt', 'pta '],
  },
  {
    slug: 'respiratory-therapy',
    title: 'Respiratory Therapy Jobs',
    metaDescription: 'Free respiratory therapy jobs, RRT, CRT, ICU, ED, NICU, home health, sleep medicine. Apply directly, no recruiter spam.',
    shortDescription: 'Respiratory Therapist roles (RRT + CRT) across hospital ICU/ED/NICU, sleep medicine, pulmonary rehab, and home respiratory care.',
    matchPatterns: ['respiratory therap', 'rrt ', ' rrt', ' crt '],
  },
  {
    slug: 'medical-assistant',
    title: 'Medical Assistant Jobs',
    metaDescription: 'Free medical assistant jobs, primary care, specialty clinics, urgent care. CMA + RMA roles. Apply free, no recruiter spam.',
    shortDescription: 'Medical Assistant (CMA, RMA, AAMA) roles across primary care, specialty clinics, urgent care, and ambulatory groups.',
    matchPatterns: ['medical assistant', 'medical asst', 'cma ', ' cma', 'rma ', ' rma'],
  },
  // Second batch of volume-allied roles (2026-05-21). Match-pattern
  // anchors avoid the dangerous 2-letter abbreviations alone.
  {
    slug: 'surgical-technologist',
    title: 'Surgical Technologist Jobs',
    metaDescription: 'Free surgical tech jobs, OR, ambulatory surgery, ortho, neuro, cardio. CST and scrub-tech roles. Apply free, no recruiter spam.',
    shortDescription: 'Surgical Technologist (CST) + scrub-tech roles across hospital ORs, ambulatory surgery centers, and specialty surgical practices.',
    matchPatterns: ['surgical tech', 'surg tech', 'scrub tech', 'surgical technologist'],
  },
  {
    slug: 'radiologic-technologist',
    title: 'Radiologic Technologist Jobs',
    metaDescription: 'Free radiologic technologist jobs, X-ray, CT, MRI, mammography, ultrasound, IR. ARRT-certified roles. Apply free.',
    shortDescription: 'Radiologic Technologist roles (ARRT-certified) across X-ray, CT, MRI, mammography, ultrasound, and interventional radiology.',
    matchPatterns: ['radiologic tech', 'rad tech', 'x-ray tech', 'xray tech', 'ct tech', 'mri tech', 'mammography tech', 'imaging tech', 'sonographer', 'ultrasound tech'],
  },
  {
    slug: 'occupational-therapy',
    title: 'Occupational Therapy Jobs',
    metaDescription: 'Free occupational therapy jobs, OTR, OT/L, COTA. Outpatient, acute care, schools, home health. Apply free.',
    shortDescription: 'Occupational Therapist (OTR/L) + Certified Occupational Therapy Assistant (COTA) roles across outpatient, acute-care hospital, school-based, and home-health settings.',
    matchPatterns: ['occupational therap', 'otr/l', 'cota '],
  },
  {
    slug: 'speech-language-pathology',
    title: 'Speech-Language Pathology Jobs',
    metaDescription: 'Free SLP jobs, CCC-SLP, school-based, medical, early intervention, telehealth. Apply free, no recruiter spam.',
    shortDescription: 'Speech-Language Pathologist (CCC-SLP) roles in schools, acute-care hospitals, early intervention, outpatient, and telehealth.',
    matchPatterns: ['speech language', 'speech-language', 'speech pathol', 'slp ', ' slp', 'ccc-slp'],
  },
  {
    slug: 'paramedic',
    title: 'EMT + Paramedic Jobs',
    metaDescription: 'Free paramedic + EMT jobs, 911 / EMS, hospital ED, critical-care transport, event medicine. NREMT roles. Apply free.',
    shortDescription: 'Paramedic + EMT (Basic / Advanced / Intermediate) roles across 911/EMS, hospital ED, critical-care transport, and event medicine.',
    matchPatterns: ['paramedic', 'emt-b', 'emt-p', 'emt-i', 'emt ', ' emt', 'emergency medical tech'],
  },
  // Third batch, entry-level + clinical-doctorate roles (2026-05-22).
  {
    slug: 'phlebotomist',
    title: 'Phlebotomist Jobs',
    metaDescription: 'Free phlebotomist jobs, hospitals, clinics, labs, mobile, donor centers. CPT-certified roles. Apply free.',
    shortDescription: 'Phlebotomist roles across hospital labs, outpatient clinics, reference labs (LabCorp, Quest), mobile draw services, and blood-donor centers.',
    matchPatterns: ['phlebotomist', 'phlebotomy', 'blood draw'],
  },
  {
    slug: 'dental-hygienist',
    title: 'Dental Hygienist Jobs',
    metaDescription: 'Free RDH jobs, general dentistry, periodontics, pediatric, public health. Licensed dental hygienist roles. Apply free.',
    shortDescription: 'Registered Dental Hygienist (RDH) roles across general dentistry, periodontics, pediatric dental, community health, and DSO groups.',
    matchPatterns: ['dental hygienist', 'rdh '],
  },
  {
    slug: 'dietitian',
    title: 'Dietitian + Nutritionist Jobs',
    metaDescription: 'Free RDN jobs, clinical, community, sports, eating-disorder, oncology, dialysis nutrition. Apply free.',
    shortDescription: 'Registered Dietitian Nutritionist (RDN) roles across clinical nutrition, community health, sports performance, eating-disorder treatment, oncology, and renal nutrition.',
    matchPatterns: ['dietitian', 'dietician', 'nutritionist', 'rdn '],
  },
  {
    slug: 'audiologist',
    title: 'Audiologist Jobs',
    metaDescription: 'Free audiologist jobs, ENT clinics, hospitals, schools, VA, hearing-aid groups. AuD + CCC-A roles. Apply free.',
    shortDescription: 'Audiologist (AuD) roles in ENT practices, hospital audiology departments, school-based audiology, VA, and private hearing-aid practices.',
    matchPatterns: ['audiologist', 'audiology', 'aud ', ' aud'],
  },
  {
    slug: 'genetic-counselor',
    title: 'Genetic Counselor Jobs',
    metaDescription: 'Free genetic counselor jobs, oncology, prenatal, cardio, pediatric, lab-side. CGC + ABGC roles. Apply free.',
    shortDescription: 'Genetic Counselor (CGC) roles in oncology, prenatal/reproductive, cardiogenetic, pediatric, neurogenetic, and laboratory-side practice.',
    matchPatterns: ['genetic counselor', 'genetic counselling', 'cgc '],
  },
]

export function getSpecialtyHub(slug: string): SpecialtyHub | undefined {
  return SPECIALTY_HUBS.find((s) => s.slug === slug)
}

/**
 * Find the SpecialtyHub whose matchPatterns matches any of the provided
 * free-text fields (typically a job's specialty + role + title).
 * Returns the first hub whose patterns hit; undefined if no match.
 *
 * Used by per-job pages to construct an internal link to the relevant
 * specialty hub for SEO link-graph density. Each hub's matchPatterns
 * intentionally use lowercase substrings (e.g. 'cardio', 'orthopedic')
 * so common variations + ATS-import inconsistency in casing don't
 * miss obvious cases.
 *
 * Matches are case-insensitive substring tests, NOT regex, keeps the
 * lookup deterministic + cheap (no surprise patterns from user input).
 */
export function findSpecialtyHub(
  ...candidates: Array<string | null | undefined>
): SpecialtyHub | undefined {
  const haystack = candidates
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .map((c) => c.toLowerCase())
    .join(' | ')
  if (!haystack) return undefined
  return SPECIALTY_HUBS.find((hub) =>
    hub.matchPatterns.some((p) => haystack.includes(p.toLowerCase()))
  )
}
