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
  // Allied health
  /\bpharmacist\b/i,
  /\bpharm tech\b/i,
  /\bsonographer\b/i,
  /\bradiologic tech\b/i,
  /\brad tech\b/i,
  /\bmri tech\b/i,
  /\bct tech\b/i,
  /\b(medical|surgical) (assistant|tech)/i,
  /\bdental (hygienist|assistant)\b/i,
  /\bdietit?ian\b/i,
  /\brespiratory therap\b/i,
  /\bphlebotom\b/i,
  /\bsleep tech\b/i,
  /\bcath lab\b/i,
  /\bsurgical tech\b/i,
  /\bcardiovascular tech\b/i,
  /\bemt\b/i,
  /\bparamedic\b/i,
  // Care/case mgmt
  /\bcare (manager|coordinator|navigator)\b/i,
  /\bcase manager\b/i,
  /\bclinical (operations|manager|director|supervisor|coordinator|reviewer)\b/i,
  /\butilization (management|review)\b/i,
  /\bdischarge planner\b/i,
  // Healthcare-adjacent ops
  /\bmedical (coder|biller|coding|billing)\b/i,
  /\bhealth ?coach\b/i,
  /\bbehavioral health\b/i,
  /\bmental health\b/i,
  /\bpatient (care|services|advocate|navigator|access)\b/i,
  /\b(clinic|hospital|hospice|home health)\b/i,
  /\bhealth ?information\b/i,
]

export function isHealthcareRelevant(title: string, department?: string | null): boolean {
  const haystack = `${title} ${department ?? ''}`
  for (const re of STRONG_HEALTHCARE_TERMS) {
    if (re.test(haystack)) return true
  }
  return false
}
