// /become/[slug] career-path guides — long-form factual pages that
// describe how someone enters a healthcare profession. SEO target is the
// "how to become a <role>" query family, which sits one step upstream
// of the actual "<role> jobs" intent we serve via /specialty/[slug].
//
// Editorial discipline (per memory S3 — content + SEO standards):
//   - Stick to well-established facts. No state-by-state license fees
//     (those change too often), no specific program lengths beyond
//     standard ranges (ADN vs BSN, etc.).
//   - No fabricated quotes, no AI-tells ("comprehensive" / "robust" /
//     "in the dynamic landscape of...").
//   - Cite the authoritative source (BLS, AACN, NCSBN, AANP, etc.) for
//     anything quantitative. Citations live in the editorialNote when
//     applicable.
//   - Differentiation from competing how-to sites (nursejournal.org,
//     allnursingschools.com, etc.) = the live job feed. Every guide
//     deep-links to /specialty/[slug] + the most relevant city×state
//     cells so visitors land on current openings, not 2018-vintage
//     program lists.
//
// Coverage rationale: we ship guides for the roles where SEARCH VOLUME
// is heavy + the path is well-defined enough to summarize honestly.
// MD specialty paths (cardiology, ortho, etc.) are intentionally NOT
// individually covered here because "how to become a cardiologist" =
// "go to med school then do an IM residency then a cardiology
// fellowship" — that's a one-paragraph answer, doesn't earn its own page.

export interface CareerPathGuide {
  /** URL slug — e.g. "registered-nurse" */
  slug: string
  /** Display title — e.g. "How to become a Registered Nurse" */
  title: string
  /** Common abbreviation, used in some heading variants */
  abbreviation?: string
  /** SEO meta description (120-155 chars) */
  metaDescription: string
  /** Lede paragraph shown above the fold */
  lede: string
  /** The career-path narrative, broken into named sections */
  sections: Array<{ heading: string; body: string }>
  /** Slug of the linked /specialty/[slug] hub */
  specialtySlug: string
  /** Plain-English label for the linked specialty hub */
  specialtyLabel: string
  /** A 1-line summary suited for cross-linking from other pages */
  oneLiner: string
}

export const CAREER_PATHS: CareerPathGuide[] = [
  {
    slug: 'registered-nurse',
    title: 'How to become a Registered Nurse (RN)',
    abbreviation: 'RN',
    metaDescription:
      'How to become a Registered Nurse — ADN vs BSN paths, NCLEX-RN licensing, typical timeline, and current RN job openings on freejobpost.co.',
    lede:
      'Registered Nurse is the largest single clinical role in US healthcare — about 3.3 million practicing RNs per the latest BLS data. The path runs from accredited nursing program → NCLEX-RN exam → state license → first staff role.',
    sections: [
      {
        heading: 'Education',
        body:
          'Two accredited paths qualify a candidate to sit for the NCLEX-RN: an Associate Degree in Nursing (ADN, typically 2 years at a community college) or a Bachelor of Science in Nursing (BSN, typically 4 years at a university). Both lead to the same RN license, but BSN graduates carry a measurable hiring + earnings premium and many hospital systems now require or strongly prefer the BSN for Magnet-designated units. An RN with an ADN can complete an RN-to-BSN bridge program in 1-2 years, often online + part-time while working.',
      },
      {
        heading: 'Licensing',
        body:
          'Every state requires passing the NCLEX-RN — a standardized exam administered by the National Council of State Boards of Nursing (NCSBN). After passing, the candidate applies for licensure through their state board. The Nurse Licensure Compact (NLC) lets an RN licensed in one compact state practice in all other compact states without separate applications; 40+ states participate. Non-compact states (California, New York, Massachusetts, others) require a separate state-specific license.',
      },
      {
        heading: 'First job',
        body:
          'Most new-grad RNs start in a hospital med-surg, telemetry, or ICU residency program (typically 6-12 months of structured orientation). After 1-2 years in acute care, common next steps include specialty units (ED, OR, L&D, NICU, oncology), case management, ambulatory clinics, or graduate school (NP, CRNA, CNS).',
      },
      {
        heading: 'Typical timeline',
        body:
          'From high-school start: 2-3 years to ADN + license, or 4-5 years to BSN + license. From career-change start (pre-existing bachelor\'s degree): Accelerated BSN programs run 12-18 months full-time. Total cost varies widely by school type — community-college ADN can land under $10,000; private-school BSN can exceed $80,000.',
      },
      {
        heading: 'What current openings look like',
        body:
          'Job listings on freejobpost.co lean heavily toward acute-care hospital RN roles: med-surg, telemetry, ICU, ED, perioperative, and L&D. Per-diem and travel-nursing roles also appear, as do ambulatory and clinic-based positions. The Florida + Texas + California metros carry the highest concentration of openings.',
      },
    ],
    specialtySlug: 'registered-nurse',
    specialtyLabel: 'Registered Nurse jobs',
    oneLiner: 'ADN or BSN → NCLEX-RN → state license. ~3.3M practicing RNs nationally.',
  },
  {
    slug: 'nurse-practitioner',
    title: 'How to become a Nurse Practitioner (NP)',
    abbreviation: 'NP',
    metaDescription:
      'How to become a Nurse Practitioner — RN → MSN/DNP → national certification + state APRN license. Open NP jobs on freejobpost.co.',
    lede:
      'Nurse Practitioners are advanced-practice RNs licensed to diagnose, treat, and (in most states) prescribe. The American Association of Nurse Practitioners reports 385,000+ licensed NPs as of 2024, with growth far outpacing physician supply.',
    sections: [
      {
        heading: 'Prerequisites',
        body:
          'An active, unencumbered RN license is required before applying to NP programs. Most programs also require 1-2 years of bedside experience, though direct-entry options exist for new-grad BSN candidates and for second-degree students entering nursing.',
      },
      {
        heading: 'Education',
        body:
          'NPs train at the graduate level — either Master of Science in Nursing (MSN) or Doctor of Nursing Practice (DNP). The American Association of Colleges of Nursing has set the DNP as the preferred entry-level credential for advanced practice, and many programs have shifted MSN → DNP, but MSN-prepared NPs remain fully licensable. Programs typically run 2-3 years for an MSN and 3-4 years for a BSN-to-DNP. Specialties chosen at admission: FNP (family), AGNP (adult-gerontology, primary or acute), PMHNP (psychiatric-mental-health), PNP (pediatric), NNP (neonatal), WHNP (women\'s health), or AGACNP (adult-gerontology acute care).',
      },
      {
        heading: 'Certification + licensing',
        body:
          'Each NP specialty has its own national certifying body (AANP, ANCC, NCC, PNCB). After passing the national cert exam, the NP applies to their state board for an Advanced Practice Registered Nurse (APRN) license. Practice authority varies by state: about half of states have Full Practice Authority (NP can diagnose + prescribe independently), the rest require physician collaboration or supervision agreements.',
      },
      {
        heading: 'Where NPs work',
        body:
          'About 70% of NPs work in primary care; the rest spread across acute care, urgent care, specialty practices (cardiology, oncology, dermatology), telehealth, hospital medicine, and skilled nursing. Family-medicine groups, federally qualified health centers, and large primary-care employers (One Medical, ChenMed, Oak Street, VillageMD) are heavy NP employers, alongside hospital systems hiring AGACNP/AGNP for hospitalist + step-down roles.',
      },
      {
        heading: 'Salary + growth',
        body:
          'BLS lists Nurse Practitioner among the fastest-growing occupations in the US (projected 38% growth 2024-2034 vs ~7% across all occupations). Median annual salary is in the $120k-$135k range nationally per recent BLS data, with significant variance by specialty (CRNAs and Psych NPs sit higher; primary-care FNPs near the median).',
      },
    ],
    specialtySlug: 'nurse-practitioner',
    specialtyLabel: 'Nurse Practitioner jobs',
    oneLiner: 'RN → MSN/DNP (FNP/AGNP/PMHNP/etc.) → national cert + state APRN license.',
  },
  {
    slug: 'physician-assistant',
    title: 'How to become a Physician Assistant (PA)',
    abbreviation: 'PA',
    metaDescription:
      'How to become a Physician Assistant — undergrad → PA school (2-3 years) → PANCE + state license. Open PA jobs on freejobpost.co.',
    lede:
      'Physician Assistants (PAs, or in some states PAs are now formally Physician Associates) are licensed clinicians who diagnose, treat, and prescribe. The American Academy of Physician Associates reports about 178,000 PAs in clinical practice.',
    sections: [
      {
        heading: 'Pre-PA prerequisites',
        body:
          'PA programs require a bachelor\'s degree + a defined set of prereq courses (general biology, anatomy + physiology, microbiology, organic chemistry, biochemistry, psychology, statistics) and most also require documented direct patient-care experience — commonly EMT/paramedic, medical assistant, scribe, or CNA roles totaling 1,000-3,000 hours.',
      },
      {
        heading: 'PA school',
        body:
          'Programs are typically 24-27 months (some run 36 months) and award a Master\'s degree (MSPAS, MMS, or similar). The first year is didactic (basic + clinical sciences); the second year is rotational, covering family medicine, internal medicine, pediatrics, surgery, OB-GYN, emergency, psychiatry, and elective rotations. Admissions are competitive — recent cycle data from the PAEA shows acceptance rates around 20-30%.',
      },
      {
        heading: 'Certification + licensing',
        body:
          'Graduates sit for the Physician Assistant National Certifying Exam (PANCE), administered by NCCPA. Pass = the PA-C credential (Certified). State licensure is administered separately through each state\'s medical or PA board. PAs maintain certification through CME and a recertification exam (PANRE) every 10 years.',
      },
      {
        heading: 'Practice + collaboration',
        body:
          'PAs practice in a team-based model with a collaborating physician. Practice agreements vary by state — some states have moved toward Optimal Team Practice with reduced administrative oversight, others retain prescriptive supervision requirements. PAs work across every specialty: about a third in surgical subspecialties, with the rest spread across primary care, emergency medicine, hospital medicine, and various medical specialties.',
      },
    ],
    specialtySlug: 'physician-assistant',
    specialtyLabel: 'Physician Assistant jobs',
    oneLiner: 'Bachelor\'s + 1-3k clinical hours → PA school (~27 mo) → PANCE + state license.',
  },
  {
    slug: 'crna',
    title: 'How to become a Certified Registered Nurse Anesthetist (CRNA)',
    abbreviation: 'CRNA',
    metaDescription:
      'How to become a CRNA — RN → ICU experience → DNP/DNAP in anesthesia (3 years) → NBCRNA cert. Open CRNA jobs on freejobpost.co.',
    lede:
      'CRNAs administer anesthesia in operating rooms, labor-and-delivery suites, pain clinics, and procedural settings. The American Association of Nurse Anesthesiology reports about 65,000 practicing CRNAs in the US — and CRNAs remain one of the highest-paid nursing roles by a meaningful margin.',
    sections: [
      {
        heading: 'Prerequisites',
        body:
          'Active RN license + a BSN (or equivalent bachelor\'s). Programs additionally require at least one year of full-time critical-care RN experience — typically ICU, with cardiothoracic, surgical, or neuro ICU favored over MICU at competitive programs. GPA + GRE scores are weighted heavily; the COA (Council on Accreditation of Nurse Anesthesia Educational Programs) requires admissions to consider the full applicant profile.',
      },
      {
        heading: 'Doctoral nurse-anesthesia program',
        body:
          'Per COA mandate, all CRNA programs entering students after 2022 must award a doctoral degree — either DNP (Doctor of Nursing Practice) or DNAP (Doctor of Nurse Anesthesia Practice). Programs run 36 months full-time, front-loaded with anesthesia pharmacology, advanced physiology, regional anesthesia, and pain management; the back half is full-time clinical anesthesia practice across rotations.',
      },
      {
        heading: 'Certification',
        body:
          'After graduating, the candidate sits for the National Certification Examination (NCE) administered by the NBCRNA. Pass = the CRNA credential. CRNAs recertify every 4 years through Continued Professional Certification, which includes a periodic assessment + CE requirements.',
      },
      {
        heading: 'Practice settings',
        body:
          'CRNAs work in hospital ORs, ambulatory surgery centers, pain-management clinics, dental + plastic-surgery practices, and rural settings where they\'re often the sole anesthesia provider. About 20+ states have opted out of federal physician-supervision requirements for CRNAs, allowing independent practice; others maintain anesthesiologist supervision agreements.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS lists Nurse Anesthetist as the highest-paid nursing role, with median annual salary above $200,000 nationally and significantly higher in rural + locum positions. The trade-off is the 3-year doctoral commitment + the ICU prereq, plus high responsibility on the job.',
      },
    ],
    specialtySlug: 'crna',
    specialtyLabel: 'CRNA jobs',
    oneLiner: 'RN + ICU experience → DNP/DNAP (36 mo) → NBCRNA cert. Highest-paid nursing role.',
  },
  {
    slug: 'pharmacist',
    title: 'How to become a Pharmacist (PharmD)',
    abbreviation: 'PharmD',
    metaDescription:
      'How to become a Pharmacist — pre-pharm undergrad → PharmD (4 years) → NAPLEX + MPJE → state license. Open pharmacist jobs on freejobpost.co.',
    lede:
      'Pharmacists dispense medications, counsel patients, manage drug regimens, and (increasingly) provide direct clinical care via collaborative practice agreements. The Bureau of Labor Statistics reports about 330,000 practicing pharmacists in the US.',
    sections: [
      {
        heading: 'Pre-pharmacy + PharmD',
        body:
          'Most candidates complete 2-4 years of undergraduate pre-pharmacy coursework before applying to a 4-year Doctor of Pharmacy (PharmD) program. Some schools admit directly from high school into 0-6 combined programs. PharmD curricula cover medicinal chemistry, pharmacology, pharmacotherapy, pharmacokinetics, and a year of rotations across community, hospital, ambulatory, and specialty settings (oncology, infectious disease, critical care, etc.).',
      },
      {
        heading: 'Licensing',
        body:
          'Graduates take two exams: the North American Pharmacist Licensure Examination (NAPLEX, tests pharmacy practice) + the Multistate Pharmacy Jurisprudence Exam (MPJE, tests state + federal pharmacy law — taken separately for each state where the candidate seeks licensure). After passing both + meeting state-specific internship hours, the pharmacist applies to the state board for licensure.',
      },
      {
        heading: 'Residencies + specialization',
        body:
          'Hospital + clinical roles increasingly require a 1- or 2-year post-graduate residency (PGY1, optionally PGY2 in a specialty like critical care, oncology, infectious disease, ambulatory, or transplant). Community + retail pharmacy roles generally don\'t require residency. Board certification (Board of Pharmacy Specialties) is available in 14+ specialties for pharmacists who want to demonstrate specialty expertise.',
      },
      {
        heading: 'Practice settings',
        body:
          'Roughly 40% of pharmacists work in community/retail (CVS, Walgreens, supermarket pharmacy, independents), 30% in hospital and clinical roles, and the rest spread across long-term care, managed care, pharmaceutical industry, academia, and ambulatory + specialty clinics. Hospital pharmacists are increasingly embedded in clinical teams as medication-management experts rather than dispensing roles.',
      },
    ],
    specialtySlug: 'pharmacist',
    specialtyLabel: 'Pharmacist jobs',
    oneLiner: 'Pre-pharm undergrad → 4-year PharmD → NAPLEX + MPJE → state license.',
  },
  {
    slug: 'lpn',
    title: 'How to become a Licensed Practical Nurse (LPN/LVN)',
    abbreviation: 'LPN',
    metaDescription:
      'How to become an LPN/LVN — practical-nursing program (12-18 months), NCLEX-PN, state license. Open LPN jobs on freejobpost.co.',
    lede:
      'Licensed Practical Nurses (LPNs, called Licensed Vocational Nurses or LVNs in California and Texas) provide basic nursing care under the supervision of RNs and physicians. About 660,000 LPNs/LVNs practice nationally per the latest BLS data, with most concentrated in long-term care, skilled nursing facilities, home health, and physician offices.',
    sections: [
      {
        heading: 'Education',
        body:
          'Accredited practical-nursing programs run 12-18 months full-time and are offered at community colleges, technical schools, and some hospital-based diploma programs. Curriculum covers basic nursing skills, pharmacology, gerontology, and supervised clinical rotations across long-term care + acute settings. Prerequisites are typically a high-school diploma or GED plus minimum GPA + sometimes the TEAS entrance exam.',
      },
      {
        heading: 'Licensing',
        body:
          'After program completion, candidates sit for the NCLEX-PN — the national exam administered by NCSBN. Pass = state-board application for licensure. Like RNs, LPN/LVN practice is governed by the Nurse Licensure Compact in 40+ states; non-compact states (CA, NY, MA, etc.) require state-specific licenses.',
      },
      {
        heading: 'Scope of practice',
        body:
          'LPN scope varies by state but generally covers basic patient care, vital signs, wound care, medication administration (oral + sometimes IV per state law), and routine assessments. RN supervision is required for care planning + IV-push medications in most states. LPNs cannot independently triage or perform sterile procedures requiring RN scope.',
      },
      {
        heading: 'Where LPNs work',
        body:
          'Roughly 35% in skilled-nursing facilities and continuing-care retirement communities, 20% in physician offices, 12% in home health, 12% in hospitals, with the rest spread across schools, correctional facilities, dialysis centers, and outpatient clinics. Hospitals have shifted away from LPN bedside roles toward all-RN staffing in many ICU/med-surg settings; long-term care and outpatient clinics remain the durable LPN job market.',
      },
      {
        heading: 'Career progression',
        body:
          'Common next step is an LPN-to-RN bridge program (~1-2 years to ADN, ~2-3 years to BSN). Many employers tuition-reimburse the bridge program for current LPN employees. From RN, further graduate paths open to NP / CRNA / educator roles.',
      },
    ],
    specialtySlug: 'lpn',
    specialtyLabel: 'LPN jobs',
    oneLiner: 'Practical-nursing program (12-18 mo) → NCLEX-PN → state license.',
  },
  {
    slug: 'cna',
    title: 'How to become a Certified Nursing Assistant (CNA)',
    abbreviation: 'CNA',
    metaDescription:
      'How to become a CNA — 4-12 week state-approved program → competency exam → state registry. Fastest entry into healthcare. Open CNA jobs on freejobpost.co.',
    lede:
      'CNA is the fastest legitimate entry point into US healthcare — most states require only a 75-150 hour state-approved training program followed by a competency exam. About 1.4 million CNAs and home health aides work nationally per BLS, primarily in long-term care, hospitals, and home health.',
    sections: [
      {
        heading: 'Training',
        body:
          'Federal law (OBRA 1987) sets a minimum of 75 training hours; most states require 75-150 hours of state-approved curriculum split between classroom instruction (anatomy + physiology, infection control, patient rights, basic care skills) and supervised clinical practice. Programs are offered at community colleges, vocational schools, the American Red Cross, and many long-term care facilities directly (often free in exchange for an employment commitment).',
      },
      {
        heading: 'Certification',
        body:
          'After completing training, candidates sit for the state competency exam (written + hands-on skills demonstration). Passing both halves places the candidate on the state\'s Nurse Aide Registry — that registry listing is what employers verify before hiring. Some states use the Prometric or Pearson Vue NACES exam; others run their own.',
      },
      {
        heading: 'Scope of practice',
        body:
          'CNAs handle activities of daily living (ADLs): bathing, feeding, ambulation, repositioning, toileting, vital signs, basic measurements. They report observations to RNs/LPNs but do not administer medications or perform sterile procedures. Some states allow Medication Aide certification as an add-on credential that expands scope to limited medication passes under supervision.',
      },
      {
        heading: 'Workplace',
        body:
          'Skilled-nursing facilities (SNFs) and long-term care employ the majority of CNAs; hospitals (often as Patient Care Techs, a similar role with slightly broader scope) and home health agencies cover most of the rest. Workload is physically demanding and turnover is high, but the path provides direct patient-care experience often required for PA school + competitive nursing-school applications.',
      },
      {
        heading: 'Career progression',
        body:
          'CNA is widely used as the prerequisite patient-care experience for nursing school, PA school, and other clinical programs. Many CNAs progress to LPN (1-1.5 years additional training) or RN (2-4 years). PA-school programs typically require 1,000-3,000 hours of direct patient care; CNA work counts toward that requirement.',
      },
    ],
    specialtySlug: 'cna',
    specialtyLabel: 'CNA jobs',
    oneLiner: '75-150 hour state-approved training → state competency exam → registry listing.',
  },
  {
    slug: 'physical-therapy',
    title: 'How to become a Physical Therapist (PT/DPT)',
    abbreviation: 'PT',
    metaDescription:
      'How to become a Physical Therapist — bachelor\'s → DPT (3 years) → NPTE → state license. Open PT jobs on freejobpost.co.',
    lede:
      'Physical Therapists treat impairment, dysfunction, and disability through movement-based interventions. Per the American Physical Therapy Association, about 251,000 PTs practice in the US, with the largest practice settings being outpatient orthopedic clinics, acute-care hospitals, home health, and skilled-nursing facilities.',
    sections: [
      {
        heading: 'Pre-PT undergraduate',
        body:
          'Most DPT programs require a bachelor\'s degree plus specific prerequisite courses: anatomy + physiology, general + organic chemistry, physics, biology, statistics, psychology, and sometimes exercise physiology. Many candidates major in exercise science, kinesiology, or biology; the specific major is less important than the prereq GPA + observation hours (typically 100-200 hours of shadowing across multiple PT practice settings).',
      },
      {
        heading: 'DPT program',
        body:
          'The Doctor of Physical Therapy is the only entry-level pathway since 2016 — Masters-level PT degrees were phased out by CAPTE (the accrediting body). DPT programs run ~3 years (some 2.5, some 3.5) and award the DPT degree. Curriculum covers anatomy, kinesiology, neuroscience, biomechanics, therapeutic exercise, manual therapy, and ~30+ weeks of full-time clinical rotations across diverse settings.',
      },
      {
        heading: 'Licensing',
        body:
          'After graduation, candidates sit for the National Physical Therapy Examination (NPTE), administered by the Federation of State Boards of Physical Therapy. Pass + state application = PT license. Some states also require a jurisprudence exam covering state-specific PT practice law. Most states have direct-access provisions allowing PTs to evaluate + treat patients without a physician referral, though insurance reimbursement sometimes still requires one.',
      },
      {
        heading: 'Residencies + specialization',
        body:
          'Optional 12-18 month residencies are available in specialty areas (orthopedic, sports, neurologic, pediatric, geriatric, cardiopulmonary, women\'s health, electrophysiology) and lead to board-certified specialist credentials via the American Board of Physical Therapy Specialties (ABPTS). Residency is not required for general practice but expected for many academic + sports-medicine roles.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual PT salary in the $100k-$105k range nationally. Compensation varies by setting (outpatient orthopedic generally lower base + higher productivity bonus; home health + travel PT pay highest hourly) and geography.',
      },
    ],
    specialtySlug: 'physical-therapy',
    specialtyLabel: 'Physical Therapy jobs',
    oneLiner: 'Bachelor\'s + ~150 observation hours → DPT (3 yr) → NPTE → state license.',
  },
  {
    slug: 'respiratory-therapy',
    title: 'How to become a Respiratory Therapist (RRT)',
    abbreviation: 'RRT',
    metaDescription:
      'How to become a Respiratory Therapist — associate or bachelor\'s degree → NBRC TMC + CSE exams → state license. Open RT jobs on freejobpost.co.',
    lede:
      'Respiratory Therapists evaluate, treat, and manage patients with breathing or cardiopulmonary disorders — from neonatal-intensive-care ventilator management to outpatient COPD therapy. About 137,000 RTs work nationally per BLS, concentrated in hospital critical-care + emergency settings.',
    sections: [
      {
        heading: 'Education',
        body:
          'Two accredited pathways: an Associate of Science in Respiratory Therapy (typically 2 years at a community college) or a Bachelor of Science in Respiratory Therapy/Care (4 years). Both qualify the candidate to sit for the credentialing exams. CoARC (Commission on Accreditation for Respiratory Care) accredits programs; only graduates of CoARC programs are eligible for the NBRC exams.',
      },
      {
        heading: 'Credentialing',
        body:
          'The National Board for Respiratory Care (NBRC) administers two exams: the Therapist Multiple Choice (TMC) and the Clinical Simulation Examination (CSE). Passing the TMC at the lower cut score = CRT (Certified Respiratory Therapist). Passing both TMC at the higher cut + CSE = RRT (Registered Respiratory Therapist), the standard credential most hospitals require. RRT is required at most US hospitals and is the credential most employers post for.',
      },
      {
        heading: 'State license',
        body:
          'After NBRC certification, candidates apply for state licensure (49 states + DC license RTs; Alaska does not). Renewal is typically every 2 years with continuing-education requirements.',
      },
      {
        heading: 'Specialties + advanced credentials',
        body:
          'RTs can earn advanced specialty credentials through NBRC: NPS (Neonatal/Pediatric Specialist), ACCS (Adult Critical Care Specialist), SDS (Sleep Disorders Specialist), CPFT/RPFT (Pulmonary Function Technologist). Many hospital RTs specialize in NICU, adult ICU, ECMO, or sleep medicine after a few years of bedside experience.',
      },
      {
        heading: 'Practice settings',
        body:
          'Hospitals employ ~80% of RTs — ICU, ED, NICU, PACU, and the floor for cardiac/pulmonary monitoring. The rest spread across home respiratory care (CPAP/BiPAP, home oxygen), sleep labs, pulmonary rehab clinics, and dive-medicine + transport teams. The role expanded significantly during COVID-19; demand remains elevated.',
      },
    ],
    specialtySlug: 'respiratory-therapy',
    specialtyLabel: 'Respiratory Therapy jobs',
    oneLiner: 'Associate or bachelor\'s in RT → NBRC TMC + CSE exams → state license.',
  },
  {
    slug: 'medical-assistant',
    title: 'How to become a Medical Assistant (MA)',
    abbreviation: 'MA',
    metaDescription:
      'How to become a Medical Assistant — postsecondary certificate (~1 year) or on-the-job training → CMA/RMA cert. Open MA jobs on freejobpost.co.',
    lede:
      'Medical Assistants handle the administrative + clinical workflow of outpatient practices — rooming patients, taking vitals, drawing blood, doing EKGs, and managing referrals + records. About 760,000 MAs work nationally per BLS, almost entirely in physician offices, urgent care, and outpatient clinics. The role doesn\'t legally require certification in most states but credentialing significantly improves hiring + pay.',
    sections: [
      {
        heading: 'Training pathways',
        body:
          'Three common paths. (1) Postsecondary certificate or diploma program — accredited by CAAHEP or ABHES, typically 9-12 months at a community college or vocational school. (2) Associate degree in medical assisting — typically 2 years, includes general-education + practical coursework. (3) On-the-job training — some employers (especially primary-care groups) hire MAs without formal training and certify them in-house, but the credentialing route is harder to access without an accredited program.',
      },
      {
        heading: 'Certification',
        body:
          'Multiple national credentials, each with its own exam: CMA (Certified Medical Assistant) by the AAMA, RMA (Registered Medical Assistant) by AMT, CCMA by NHA, NCMA by NCCT. The CMA from AAMA requires graduation from a CAAHEP/ABHES-accredited program; the others have more flexible eligibility. Hospitals and large primary-care groups generally prefer certified MAs and may pay $1-3/hr more.',
      },
      {
        heading: 'Scope of practice',
        body:
          'MAs handle clinical tasks (vital signs, EKGs, phlebotomy, injections, sterile procedures assist, point-of-care testing) AND administrative tasks (scheduling, insurance verification, prior authorizations, charting, referrals). Scope is delegated by the supervising physician and varies by state — some states regulate MA injection authority + EKG performance, others leave it to physician discretion.',
      },
      {
        heading: 'Practice settings',
        body:
          'Primary-care offices employ the largest share, followed by specialty practices (cardiology, dermatology, OB-GYN), urgent care, and ambulatory surgery centers. Larger group practices and federally qualified health centers (FQHCs) hire heavily. Hospitals employ MAs in outpatient departments + procedural areas, less commonly inpatient.',
      },
      {
        heading: 'Career progression',
        body:
          'MA is a common stepping-stone to LPN/RN, PA school, or surgical-tech roles. The 1,000-3,000 clinical hours PA programs require are easily accumulated during MA work; MAs frequently apply to PA school after 2-3 years of practice.',
      },
    ],
    specialtySlug: 'medical-assistant',
    specialtyLabel: 'Medical Assistant jobs',
    oneLiner: 'Postsecondary certificate (~12 mo) or on-the-job training → optional CMA/RMA cert.',
  },
  {
    slug: 'surgical-technologist',
    title: 'How to become a Surgical Technologist (CST)',
    abbreviation: 'CST',
    metaDescription:
      'How to become a Surgical Technologist (CST) — accredited program (~12-24 mo) → NBSTSA cert → state recognition. Open surgical tech jobs on freejobpost.co.',
    lede:
      'Surgical Technologists (scrub techs) prepare the operating room, assist the surgeon during procedures, and manage sterile fields + instruments. About 117,000 surgical techs work nationally per BLS, almost entirely in hospital ORs and ambulatory surgery centers — a role that grew faster than overall healthcare hiring through 2020-2024.',
    sections: [
      {
        heading: 'Training',
        body:
          'Accredited programs run 12-24 months and award a certificate, diploma, or associate degree. Accreditation comes from CAAHEP or ABHES; only graduates of accredited programs are eligible for the leading certification (CST). Curriculum covers anatomy, microbiology, surgical procedures across specialties (general, ortho, cardio, neuro, ENT, OB-GYN, GU), sterile technique, and supervised OR clinical rotations.',
      },
      {
        heading: 'Certification',
        body:
          'The Certified Surgical Technologist (CST) credential is administered by the NBSTSA (National Board of Surgical Technology and Surgical Assisting) and is the standard credential most hospitals require. NCCT offers an alternative — the TS-C (Tech in Surgery — Certified). A few states (TX, NY, MA, IN, NJ, PA, SC, TN, WA) require state recognition or registration in addition to national cert; the rest defer to the national credential.',
      },
      {
        heading: 'Specialization',
        body:
          'After 1-2 years of general OR experience, techs commonly specialize in a single service line: cardiothoracic, neurosurgery, orthopedic, robotic-assisted surgery, transplant, or trauma. Many ASCs (ambulatory surgery centers) cross-train techs across multiple specialties. Travel surgical-tech work is a high-paying option for experienced CSTs willing to relocate every 13 weeks.',
      },
      {
        heading: 'Career progression',
        body:
          'Common next steps: lead/charge surgical tech, surgical first-assistant (CSFA — requires additional training + credential), nursing (LPN/RN bridge programs), or PA school. The OR exposure surgical techs accumulate is highly valued by PA programs as direct patient-care hours.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS lists median annual surgical-tech salary in the $58k-$62k range, with significant geographic + setting variance. Travel CSTs and night-shift trauma roles command meaningfully higher comp. Ambulatory surgery centers typically pay less than hospital ORs but offer more predictable hours.',
      },
    ],
    specialtySlug: 'surgical-technologist',
    specialtyLabel: 'Surgical Technologist jobs',
    oneLiner: 'Accredited program (12-24 mo) → NBSTSA CST exam → (state recognition where required).',
  },
  {
    slug: 'radiologic-technologist',
    title: 'How to become a Radiologic Technologist (RT)',
    abbreviation: 'RT(R)',
    metaDescription:
      'How to become a Radiologic Technologist — accredited program (2 yr AS) → ARRT exam → state license. Open RT jobs on freejobpost.co.',
    lede:
      'Radiologic Technologists operate the imaging equipment that produces diagnostic X-rays, CT scans, MRI, mammography, ultrasound, and fluoroscopy. About 220,000 radiologic + MRI techs work nationally per BLS, primarily in hospital radiology departments, outpatient imaging centers, and specialty diagnostic groups.',
    sections: [
      {
        heading: 'Education',
        body:
          'Accredited radiologic-technology programs run 22-24 months and award an Associate of Science (AS) degree. Accreditation comes from JRCERT (Joint Review Committee on Education in Radiologic Technology); only JRCERT-accredited program graduates are ARRT-eligible. A small number of 4-year BS-level programs exist, often combined with management or sub-specialty tracks. Curriculum covers radiation physics, anatomy, patient positioning, radiation safety, imaging principles, and ~1,800-2,000 hours of supervised clinical practice.',
      },
      {
        heading: 'ARRT certification',
        body:
          'The American Registry of Radiologic Technologists (ARRT) administers the primary credentialing exam. Passing earns the R.T.(R)(ARRT) credential — "Radiography" certification, the entry-level RT credential. Most states (37 + DC) require state licensure in addition to ARRT certification; some states accept ARRT certification directly, others require a state-specific exam.',
      },
      {
        heading: 'Modality specialties',
        body:
          'After working as a general radiographer, techs typically pursue a second ARRT post-primary certification in a modality: Computed Tomography (CT), Magnetic Resonance Imaging (MRI), Mammography (M), Vascular-Interventional (VI), Cardiac-Interventional (CI), Bone Densitometry (BD), Sonography (S), Nuclear Medicine (NM), or Radiation Therapy (T). Most modalities require documented clinical hours + a separate ARRT exam. CT and MRI are the highest-volume specialty paths.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual radiologic-tech salary in the $76k-$80k range. MRI techs and CT techs typically earn 10-25% above general radiography. Night/weekend differentials in trauma centers + IR cath labs add meaningfully to base. Travel radiologic-tech work is widely available.',
      },
      {
        heading: 'Career progression',
        body:
          'Lead/chief tech, modality supervisor, imaging-department manager, applications specialist (working for a manufacturer like GE/Siemens/Philips), CT/MRI fellowship, or RA (Radiologist Assistant — a master\'s-level credential that expands scope significantly).',
      },
    ],
    specialtySlug: 'radiologic-technologist',
    specialtyLabel: 'Radiologic Technologist jobs',
    oneLiner: 'AS in radiologic tech (~24 mo) → ARRT(R) exam → state license + modality specialty.',
  },
  {
    slug: 'occupational-therapy',
    title: 'How to become an Occupational Therapist (OTR/L)',
    abbreviation: 'OT',
    metaDescription:
      'How to become an Occupational Therapist — bachelor\'s → MOT or OTD → NBCOT cert → state license. Open OT jobs on freejobpost.co.',
    lede:
      'Occupational Therapists help patients regain independence in activities of daily living (ADLs) — feeding, dressing, work tasks, school participation — after injury, illness, developmental delay, or aging. About 152,000 OTs practice nationally per BLS, with growth projections among the highest of any healthcare profession (12% over 2024-2034).',
    sections: [
      {
        heading: 'Pre-OT undergraduate',
        body:
          'Most OT programs require a bachelor\'s degree + specific prereq courses: anatomy + physiology, neuroscience, statistics, psychology (lifespan + abnormal), sociology, and ~40-60 hours of observation across multiple OT practice settings. Common undergraduate majors: psychology, kinesiology, exercise science, biology — though any major satisfying prereqs is acceptable.',
      },
      {
        heading: 'Graduate program',
        body:
          'Two accredited entry-level paths since ACOTE\'s 2027 deadline removed: Master of Occupational Therapy (MOT, ~2-2.5 years) or Doctor of Occupational Therapy (OTD, ~3 years). Both qualify graduates for licensure. The OTD adds a 14-16 week doctoral capstone but is not currently required for general practice. Curriculum covers anatomy, kinesiology, neurology, occupational science, intervention planning, evidence-based practice, and 24+ weeks of full-time Level II fieldwork.',
      },
      {
        heading: 'Licensing',
        body:
          'After graduation, candidates sit for the NBCOT (National Board for Certification in Occupational Therapy) exam. Pass = OTR (Occupational Therapist, Registered) credential. State licensure is administered separately by each state — all 50 + DC license OTs. Many states also license Certified Occupational Therapy Assistants (COTAs), the associate-degree-level OT support role.',
      },
      {
        heading: 'Practice settings',
        body:
          'Outpatient hand therapy, acute-care hospital, pediatric (schools + early intervention), skilled-nursing + long-term care, home health, mental-health, and emerging telehealth-based ergonomic + return-to-work consulting. Pediatric OT (school-based + early-intervention) and adult outpatient hand therapy are the two highest-volume specialty paths.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual OT salary around $93k-$98k. Home-health + travel OT pay highest hourly; school-based OT typically lowest (but with school-year schedule + benefits). Specialty hand therapy (CHT credential) commands a premium.',
      },
    ],
    specialtySlug: 'occupational-therapy',
    specialtyLabel: 'Occupational Therapy jobs',
    oneLiner: 'Bachelor\'s + 40-60 observation hours → MOT or OTD → NBCOT exam → state license.',
  },
  {
    slug: 'speech-language-pathology',
    title: 'How to become a Speech-Language Pathologist (SLP)',
    abbreviation: 'SLP',
    metaDescription:
      'How to become an SLP — bachelor\'s → master\'s in speech-language pathology → CCC-SLP → state license. Open SLP jobs on freejobpost.co.',
    lede:
      'Speech-Language Pathologists evaluate, diagnose, and treat communication and swallowing disorders across the lifespan — from pediatric language delay to post-stroke aphasia to swallowing dysfunction in neuro-degenerative disease. About 175,000 SLPs practice nationally per BLS; ~55% work in schools and ~25% in healthcare settings.',
    sections: [
      {
        heading: 'Undergraduate',
        body:
          'A bachelor\'s in Communication Sciences and Disorders (CSD) is the most direct path — but applicants from other majors can complete post-baccalaureate prereq coursework (typically 1 year) to qualify for master\'s programs. Prereqs include statistics, biological + physical sciences, social/behavioral sciences, and CSD-specific courses (phonetics, anatomy of speech + hearing, language development).',
      },
      {
        heading: 'Master\'s program',
        body:
          'Master\'s in Speech-Language Pathology (MA/MS) is the standard entry-level degree, accredited by the Council on Academic Accreditation (CAA). Programs run 2 years full-time, with the second year heavily clinical — students complete 400+ clock hours of supervised clinical experience across diverse settings (pediatric + adult, medical + educational).',
      },
      {
        heading: 'Clinical Fellowship + CCC',
        body:
          'After graduation, the new SLP completes a Clinical Fellowship (CF) — a 36-week paid practicum under the supervision of a CCC-credentialed SLP. After CF completion + passing the Praxis Exam in Speech-Language Pathology, ASHA awards the Certificate of Clinical Competence in Speech-Language Pathology (CCC-SLP). This is the standard credential employers + most state licensing boards require.',
      },
      {
        heading: 'Licensing',
        body:
          'All 50 states + DC require state licensure. Many states accept CCC-SLP directly; some require separate state exams. School-based SLPs may need an additional teaching credential depending on the state — some states require the educational SLP credential, others accept the clinical CCC-SLP for school employment.',
      },
      {
        heading: 'Specialization',
        body:
          'ASHA offers Board Certification in Specialty Areas (BCS) — child language, swallowing, fluency, intraoperative monitoring. Common practice specialties: pediatric (early-intervention + school-age + autism), adult neurogenic (post-stroke + TBI + dementia), dysphagia (swallowing), AAC (augmentative + alternative communication), voice + speech motor, fluency.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual SLP salary around $89k-$95k. Healthcare-setting SLPs typically earn meaningfully more than school-based, with travel SLPs at the top of the range. Sign-on bonuses are common in dysphagia + hospital-based adult-neurogenic roles where supply is tight.',
      },
    ],
    specialtySlug: 'speech-language-pathology',
    specialtyLabel: 'SLP jobs',
    oneLiner: 'Bachelor\'s (CSD or w/ prereqs) → Master\'s in SLP → CF + Praxis → CCC-SLP + state license.',
  },
  {
    slug: 'paramedic',
    title: 'How to become an EMT or Paramedic',
    abbreviation: 'EMT/Paramedic',
    metaDescription:
      'How to become an EMT or Paramedic — EMT-B (~150h) or Paramedic (1-2 years) → NREMT cert → state license. Open EMT/paramedic jobs.',
    lede:
      'Emergency Medical Technicians and Paramedics provide pre-hospital + transport emergency care — from basic life support at the EMT level to advanced cardiac, airway, and trauma management at the Paramedic level. About 270,000 EMTs + paramedics work nationally per BLS, across 911 services, fire-rescue, hospital-based ambulance services, and critical-care transport.',
    sections: [
      {
        heading: 'EMT-Basic (entry level)',
        body:
          'EMT-Basic (EMT) is the entry-level credential. Training is a ~120-200 hour state-approved program (typically 8-16 weeks part-time, or a 1-semester course at a community college). Coverage: patient assessment, CPR + AED, oxygen, basic airway management, trauma care, OB emergencies, hazmat awareness. Prereqs: high-school diploma, age 18+, and usually current CPR certification.',
      },
      {
        heading: 'Advanced + Intermediate EMT',
        body:
          'Advanced EMT (AEMT — sometimes called EMT-I depending on state) adds IV access, limited medication administration, advanced airway adjuncts (King airway, supraglottic devices), and more advanced patient assessment. Training is ~150-250 hours beyond EMT-B. AEMT is heavily used in rural systems where Paramedic-staffed ambulances aren\'t economically feasible.',
      },
      {
        heading: 'Paramedic',
        body:
          'Paramedic is the highest pre-hospital provider level. Accredited Paramedic programs run 1-2 years (1,000-1,800 hours) at community colleges, vocational schools, or fire-academy programs, and award a certificate or associate degree. Many BS-level Paramedic programs exist, especially in academic + flight-medicine settings. Scope adds: cardiac monitoring + 12-lead interpretation, defibrillation + cardioversion + pacing, advanced airway (intubation, cricothyrotomy in some states), advanced pharmacology + IV/IO drug administration, fluid resuscitation, and field-decision-making for STEMI/stroke/trauma triage.',
      },
      {
        heading: 'Certification + licensure',
        body:
          'The National Registry of Emergency Medical Technicians (NREMT) administers cognitive + psychomotor exams at each level (EMT, AEMT, Paramedic). NREMT certification + state-specific application = state license. About 47 states use NREMT as the basis for state licensure; the rest run their own state exams. NREMT recertification every 2 years requires continuing education + skills verification.',
      },
      {
        heading: 'Practice settings + progression',
        body:
          '911 / municipal EMS (fire-based or third-service), hospital-based ambulance, private inter-facility transport, critical-care transport (CCT), flight medicine (HEMS), event medicine, industrial + offshore EMS, military medicine. Common progression: EMT → Paramedic → flight medic, critical-care paramedic (CCP-C), educator, EMS supervisor, or bridge to RN / PA / nursing programs (EMS field experience is highly valued in clinical-program admissions).',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports wide compensation ranges: EMT median around $42k, Paramedic median around $50k-$60k, flight paramedics + critical-care paramedics in the $70k-$95k range. Fire-based EMS pay tends to be higher than third-service or private; coastal + metropolitan systems pay above rural. Overtime is heavy in most 911 systems.',
      },
    ],
    specialtySlug: 'paramedic',
    specialtyLabel: 'EMT + Paramedic jobs',
    oneLiner: 'EMT-B (~150h) → AEMT (~250h) → Paramedic (1-2 yr) → NREMT cert + state license.',
  },
  {
    slug: 'phlebotomist',
    title: 'How to become a Phlebotomist',
    abbreviation: 'CPT',
    metaDescription:
      'How to become a Phlebotomist — short certificate program (4-8 weeks) → national cert (ASCP/AMT/NHA) → state requirements vary. Open phlebotomist jobs.',
    lede:
      'Phlebotomists draw blood samples for diagnostic testing, transfusion, donation, and research. About 138,000 phlebotomists work nationally per BLS — one of the shortest training paths into clinical healthcare.',
    sections: [
      {
        heading: 'Training',
        body:
          'Accredited phlebotomy certificate programs run 4-12 weeks (some longer) at community colleges, vocational schools, the American Red Cross, and many hospital labs. Curriculum covers anatomy + venipuncture, infection control, specimen handling + labeling, capillary draws, special collections (blood cultures, ABGs), patient communication, and supervised clinical hours. Most programs require 100-120 successful supervised draws before completion.',
      },
      {
        heading: 'Certification',
        body:
          'National certification is voluntary in most states but strongly preferred by employers. Multiple credentials exist: CPT (Certified Phlebotomy Technician) from ASCP, RPT (Registered Phlebotomy Technician) from AMT, CPT (Certified Phlebotomy Technician) from NHA, and PBT (Phlebotomy Technician) from ASCP. California, Louisiana, Nevada, and Washington require state-specific certification.',
      },
      {
        heading: 'Practice settings',
        body:
          'Hospital labs (in/outpatient), reference labs (LabCorp, Quest Diagnostics), physician offices + clinics, plasma + blood donation centers (Grifols, CSL Plasma, American Red Cross), mobile draw services, research facilities. Hospital phlebotomy is typically the highest-volume + most varied; reference-lab work is the most efficient + repetitive.',
      },
      {
        heading: 'Career progression',
        body:
          'Phlebotomy is widely used as a stepping-stone — direct patient-care experience that PA/medical/nursing schools accept as clinical hours. Common next moves: medical assistant, nursing program, clinical lab tech (CLT/MLT), or specialty phlebotomy (donor-center, pediatric, intensive draws). CPT credential plus 2+ years experience opens lead-phlebotomist + lab-supervisor roles.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS median annual phlebotomist salary in the $40k-$45k range. Hospital + trauma-center phlebotomy generally pays more than retail blood-draw or reference-lab work. Night + weekend differentials are common. The role doesn\'t require a degree, so total time-to-paid is among the fastest in healthcare.',
      },
    ],
    specialtySlug: 'phlebotomist',
    specialtyLabel: 'Phlebotomist jobs',
    oneLiner: 'Phlebotomy certificate (4-12 weeks) → optional national cert (CPT/RPT) → first job.',
  },
  {
    slug: 'dental-hygienist',
    title: 'How to become a Dental Hygienist (RDH)',
    abbreviation: 'RDH',
    metaDescription:
      'How to become an RDH — accredited dental-hygiene program (2-4 yr) → NBDHE → state clinical exam + license. Open RDH jobs on freejobpost.co.',
    lede:
      'Dental Hygienists deliver preventive oral care: cleanings, periodontal therapy, sealants, fluoride application, oral-health education, and clinical screening for systemic conditions visible in the mouth. About 217,000 RDHs practice nationally per BLS.',
    sections: [
      {
        heading: 'Education',
        body:
          'Two CODA-accredited paths qualify a candidate to sit for licensing exams: an Associate of Applied Science in Dental Hygiene (typically 2-3 years at a community college) or a Bachelor of Science in Dental Hygiene (4 years). Both lead to the same RDH license. ADHA (American Dental Hygienists\' Association) reports the BS path opens additional opportunities in research, public health, and corporate / DSO settings.',
      },
      {
        heading: 'Licensing exams',
        body:
          'Candidates take the National Board Dental Hygiene Examination (NBDHE — written) administered by the Joint Commission on National Dental Examinations, AND a regional or state clinical examination (most states accept ADEX, WREB, CITA, or CRDTS). Both required for RDH licensure. Some states additionally require a state jurisprudence exam.',
      },
      {
        heading: 'Scope of practice',
        body:
          'RDHs perform prophy (cleaning) + scaling-and-root-planing (SRP), administer local anesthesia in ~46 states (state-dependent), take + interpret dental radiographs, place sealants, apply fluoride, conduct periodontal charting, and document oral findings. About 24 states allow some form of dental hygiene practice without on-site dentist supervision (varies widely — collaborative practice agreements, public-health hygiene, etc.).',
      },
      {
        heading: 'Practice settings',
        body:
          'Private dental practices employ the majority — general dentistry + periodontic specialty offices. Pediatric dental, community + public health, school-based programs, DSO (dental service organization) groups like Heartland + Pacific Dental, and corporate roles with dental product companies all hire RDHs.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual RDH salary around $87k-$93k. RDH commonly ranks in the top 10 highest-paying associate-degree-only US careers. Compensation varies by state and practice setting — DSO + corporate groups typically structure as base + production bonus; private offices commonly hourly + benefits.',
      },
    ],
    specialtySlug: 'dental-hygienist',
    specialtyLabel: 'Dental Hygienist jobs',
    oneLiner: 'CODA-accredited program (2-4 yr) → NBDHE + state clinical exam → RDH license.',
  },
  {
    slug: 'dietitian',
    title: 'How to become a Registered Dietitian Nutritionist (RDN)',
    abbreviation: 'RDN',
    metaDescription:
      'How to become a Registered Dietitian — accredited bachelor\'s + master\'s (required 2024+) → internship → CDR exam → state license. Open RDN jobs.',
    lede:
      'Registered Dietitian Nutritionists (RDNs) translate nutrition science into patient-care plans across clinical, community, sports, food-service, and outpatient settings. About 75,000 RDNs practice nationally per the Commission on Dietetic Registration; the credentialing requirements moved from bachelor\'s to master\'s as of January 2024.',
    sections: [
      {
        heading: 'Education',
        body:
          'As of January 2024, the Commission on Dietetic Registration (CDR) requires a graduate degree to sit for the RDN exam — typically a Master of Science in Nutrition or a coordinated program leading to MS + supervised practice. ACEND-accredited programs are the only ones whose graduates are eligible.',
      },
      {
        heading: 'Supervised practice',
        body:
          'Candidates complete an ACEND-accredited supervised-practice rotation (formerly a "dietetic internship") totaling at least 1,000 hours across clinical, community, and food-service settings. Coordinated programs integrate the supervised practice into the master\'s curriculum; standalone internships run ~9-12 months post-degree. Match rates for standalone internships historically run 50-70% — coordinated programs avoid this risk.',
      },
      {
        heading: 'Examination + licensure',
        body:
          'After supervised practice, candidates sit for the CDR registration exam. Passing = RDN credential. About 38 states + DC also require state licensure in addition to RDN — application requirements vary; some states accept CDR registration directly, others require a state-specific application + fee.',
      },
      {
        heading: 'Practice settings',
        body:
          'Clinical (hospital + outpatient) is the largest segment — inpatient medical nutrition therapy, diabetes education, weight-management programs, oncology nutrition, renal/dialysis, eating-disorder treatment. Other paths: community + public health (WIC, SNAP-Ed), sports nutrition (collegiate, pro teams), corporate wellness, food-service management (Sodexo, Aramark, Compass), retail (supermarket dietitians at Kroger / Wegmans), private practice (insurance-billed or cash-pay), and pharmaceutical / food industry.',
      },
      {
        heading: 'Specialization',
        body:
          'CDR offers board certifications in 8 specialty areas — oncology (CSO), pediatric (CSP), renal (CSR), gerontological (CSG), sports (CSSD), obesity/weight management (CSOWM), and Intuitive Eating + clinical eating-disorder credentials offered through other bodies.',
      },
    ],
    specialtySlug: 'dietitian',
    specialtyLabel: 'Dietitian jobs',
    oneLiner: 'Master\'s in nutrition + ACEND supervised practice → CDR exam → RDN + state license.',
  },
  {
    slug: 'audiologist',
    title: 'How to become an Audiologist (AuD)',
    abbreviation: 'AuD',
    metaDescription:
      'How to become an Audiologist — bachelor\'s → 4-year AuD doctoral program → Praxis + ASHA CCC-A → state license. Open audiologist jobs.',
    lede:
      'Audiologists diagnose + treat hearing and balance disorders across the lifespan. The entry-level credential moved from master\'s to Doctor of Audiology (AuD) in 2007 — all current entry paths are doctoral. About 14,000 audiologists practice in the US per BLS.',
    sections: [
      {
        heading: 'Undergraduate',
        body:
          'Most AuD programs accept candidates from any bachelor\'s major + completion of prerequisite courses (typically a year of biology, physics, chemistry, statistics, and several CSD or speech-and-hearing-sciences courses). Communication Sciences and Disorders (CSD) is the most direct undergraduate major; psychology + biology are also common.',
      },
      {
        heading: 'Doctoral program',
        body:
          'The Doctor of Audiology (AuD) is a 4-year clinical doctorate accredited by CAA (Council on Academic Accreditation in Audiology and Speech-Language Pathology). Curriculum covers anatomy + physiology of the auditory + vestibular systems, audiometric testing, hearing aids + cochlear implants, pediatric audiology, vestibular assessment, electrophysiology, balance disorders, and ~1,820 hours of supervised clinical practicum culminating in a fourth-year externship.',
      },
      {
        heading: 'Credentialing + licensure',
        body:
          'After graduation, candidates take the Praxis Examination in Audiology administered by ETS. Pass = eligible for the Certificate of Clinical Competence in Audiology (CCC-A) from ASHA, the standard credential most employers + insurers require. State licensure (all 50 states + DC) is separate; most states accept CCC-A directly.',
      },
      {
        heading: 'Practice settings',
        body:
          'Otolaryngology (ENT) practices, hospital audiology departments, school-based audiology (educational audiologist credential adds state-dependent requirements), Veterans Affairs (one of the largest US audiology employers), private hearing-aid + cochlear-implant practices, balance + vestibular specialty clinics, pediatric specialty hospitals, military medicine.',
      },
      {
        heading: 'Compensation',
        body:
          'BLS reports median annual audiologist salary around $87k-$92k. VA + hospital settings + senior management roles command meaningfully more; private-practice owners earn highly variable income based on case mix + product fitting. Specialty certifications (Cochlear Implant, Vestibular Audiology) add a modest premium.',
      },
    ],
    specialtySlug: 'audiologist',
    specialtyLabel: 'Audiologist jobs',
    oneLiner: 'Bachelor\'s + prereqs → 4-year AuD → Praxis + ASHA CCC-A → state license.',
  },
  {
    slug: 'genetic-counselor',
    title: 'How to become a Genetic Counselor (CGC)',
    abbreviation: 'CGC',
    metaDescription:
      'How to become a Genetic Counselor — bachelor\'s + prereqs → master\'s in genetic counseling (~2 yr) → ABGC certification → state license. Open CGC jobs.',
    lede:
      'Genetic Counselors interpret genetic and genomic testing results for patients + clinicians — translating risk, recurrence, and management implications into actionable clinical guidance. About 5,800 board-certified genetic counselors practice in the US per the American Board of Genetic Counseling — one of the fastest-growing healthcare professions per BLS.',
    sections: [
      {
        heading: 'Undergraduate prerequisites',
        body:
          'Most genetic-counseling programs require a bachelor\'s degree + a defined prerequisite course set: genetics, biochemistry, statistics, psychology (including abnormal + lifespan), and often organic chemistry. Many candidates major in biology, genetics, psychology, or molecular biology. Programs also typically require documented experience in counseling + healthcare exposure (crisis-line volunteering, advocacy work, shadowing) — applications without these tend to be uncompetitive.',
      },
      {
        heading: 'Master\'s program',
        body:
          'Master of Science in Genetic Counseling accredited by ACGC (Accreditation Council for Genetic Counseling) — typically 2 years (4 semesters + summer rotations). Curriculum: medical genetics, prenatal + pediatric + adult genetics, cancer genetics, cardiogenetics, neurogenetics, counseling theory, ethics, lab methods (NGS, microarray, karyotype), and ~50+ supervised clinical cases across multiple specialty areas. ACGC programs are competitive — historically <30% acceptance rates at established programs.',
      },
      {
        heading: 'Certification + licensure',
        body:
          'After graduation, candidates sit for the ABGC (American Board of Genetic Counseling) certification exam. Pass = CGC credential. State licensure is jurisdiction-dependent — about half of US states + DC license genetic counselors, requiring ABGC certification + state-specific application; others rely solely on ABGC.',
      },
      {
        heading: 'Practice settings',
        body:
          'Hospital-based clinical genetics (most common — prenatal, pediatric, cancer, cardio, neuro), commercial laboratories (variant interpretation, customer-facing CGC roles at Invitae, Natera, Color, Ambry, Myriad), telehealth (Genome Medical, Genoox), industry / pharmaceutical, research, and increasingly outpatient + specialty groups embedding CGCs into existing teams (cancer centers, cardiology + neurology specialty practices).',
      },
      {
        heading: 'Compensation',
        body:
          'NSGC professional-status survey reports median annual GC salary around $95k-$105k, with industry + telehealth + senior clinical roles trending higher ($110k-$150k+). Cost of entry (a 2-year master\'s) is moderate compared to AuD or DNP paths; growth rate is among the highest in healthcare per BLS (~16% over 2024-2034).',
      },
    ],
    specialtySlug: 'genetic-counselor',
    specialtyLabel: 'Genetic Counselor jobs',
    oneLiner: 'Bachelor\'s + prereqs + counseling exposure → ACGC master\'s (~2 yr) → ABGC → license (jurisdiction-dependent).',
  },
]

export function getCareerPath(slug: string): CareerPathGuide | undefined {
  return CAREER_PATHS.find((p) => p.slug === slug)
}
