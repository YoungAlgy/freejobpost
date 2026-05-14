// Healthcare-relevance filter for ATS-imported jobs.
//
// We're a healthcare job board. We don't want every engineering, marketing, or
// finance role from Oscar Health's full board — just the clinical + healthcare-
// adjacent roles candidates on freeresumepost.co care about.
//
// Strategy: be generous. We'd rather keep a marginal role (e.g. "Care
// Navigator") than miss a clinical one. The downstream specialty classifier
// will tag what it can; the rest land as "Healthcare — Other" which is fine
// for SEO long-tail.

// Strong-signal terms: title clearly indicates a healthcare role.
const STRONG_HEALTHCARE_TERMS = [
  // Clinical providers
  /\bphysician\b/i,
  /\bdoctor\b/i,
  /\bmedical director\b/i,
  /\b(nurse|nursing)\b/i,
  /\brn\b/i,
  /\blpn\b/i,
  /\blvn\b/i,
  /\bnp\b/i,
  /\bnurse practitioner\b/i,
  /\bcrna\b/i,
  /\bpa[\s-]c\b/i,
  /\bphysician assistant\b/i,
  /\bmd\b/i,
  /\bdo\b(?!\s*not)/i,
  // Therapists
  /\btherapist\b/i,
  /\bcounselor\b/i,
  /\bpsychiatrist\b/i,
  /\bpsychologist\b/i,
  /\bsocial work\b/i,
  /\blcsw\b/i,
  /\blmft\b/i,
  /\blpc\b/i,
  /\bspeech[\s-]language\b/i,
  /\boccupational therap\b/i,
  /\bphysical therap\b/i,
  /\bbcba\b/i,
  // Allied health — imaging + lab + tech roles
  /\bpharmacist\b/i,
  /\bpharm(acy)? tech(nician)?\b/i,
  /\bsonographer\b/i,
  /\bradiologic\b/i,
  /\b(ct|mri|ultrasound|nuclear|mammography|sonography|imaging|cardiology|cardiac|echo|eeg|ekg|cath|vascular) (tech|technologist|technician)\b/i,
  /\b(medical|surgical|radiologic|laboratory|histology|cytology|sterile processing|orthopedic|orthopaedic) tech(nologist|nician)?\b/i,
  /\bmedical lab(oratory)? (tech|scientist)\b/i,
  /\bsterile processing\b/i,
  /\b(medical|surgical) assistant\b/i,
  /\bdental (hygienist|assistant)\b/i,
  /\bdietit?ian\b/i,
  /\brespiratory therap\b/i,
  /\bphlebotom\b/i,
  /\bsleep tech\b/i,
  /\bcath lab\b/i,
  /\bcardiovascular\b/i,
  /\bemt\b/i,
  /\bparamedic\b/i,
  /\boptometrist\b/i,
  /\baudiologist\b/i,
  /\boptician\b/i,
  /\bperfusionist\b/i,
  // Care/case mgmt
  /\bcare (manager|coordinator|navigator|specialist|partner|assistant)\b/i,
  /\bcase manager\b/i,
  /\bclinical (operations|manager|director|supervisor|coordinator|reviewer|specialist|educator|liaison|nurse|pharmacist|fellow|research|trial|documentation|appeals)\b/i,
  /\butilization (management|review)\b/i,
  /\bdischarge planner\b/i,
  // Hospital-specific clinical
  /\b(transplant|oncology|cardiac|cardiology|neuro|pulmonary|hematology|hepatology|gastro|nephrology|urology|orthop(a|ae)dic|surgical|surgery|maternity|labor and delivery|nicu|picu|micu|icu|ed|emergency room|operating room|or|pre-op|post-op|anesthesia|pain management) (coordinator|specialist|aide|assistant|navigator|fellow|resident|tech|nurse|admin)\b/i,
  /\b(charge|staff|float|relief|travel|locum) nurse\b/i,
  // Healthcare-adjacent ops
  /\bmedical (coder|biller|coding|billing|records|secretary|scribe)\b/i,
  /\bhealth ?coach\b/i,
  /\bbehavioral health\b/i,
  /\bmental health\b/i,
  /\bpatient (care|services|advocate|navigator|access|registration|coordinator|service|experience)\b/i,
  /\b(clinic|hospital|hospice|home health|skilled nursing|long.term care)\b/i,
  /\bhealth ?information\b/i,
  /\b(certified|registered|licensed) nursing assistant\b/i,
  /\bcna\b/i,
]

export function isHealthcareRelevant(title: string, department?: string | null): boolean {
  const haystack = `${title} ${department ?? ''}`
  for (const re of STRONG_HEALTHCARE_TERMS) {
    if (re.test(haystack)) return true
  }
  return false
}
