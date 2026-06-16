/**
 * Affiliate program registry.
 *
 * Links come from env vars so a program can go LIVE the moment it approves us,
 * with zero code change and zero redeploy risk: set the env var in Vercel, done.
 * An empty/unset link makes the offer render NOTHING (getAffiliate returns null),
 * so shipping this is safe before any program is approved.
 *
 * Set these in Vercel env once approved (NEXT_PUBLIC_ so they reach the client link):
 *   NEXT_PUBLIC_AFF_JOBCOPILOT   (apply: https://jobcopilot.com/affiliates/  — 30% recurring)
 *   NEXT_PUBLIC_AFF_RESUMEIO     (apply: https://resume.io/affiliates)
 *   NEXT_PUBLIC_AFF_FINALROUND   (apply: https://www.finalroundai.com/influencer-program)
 *   NEXT_PUBLIC_AFF_COURSERA     (apply: https://www.coursera.org/about/affiliates)
 */
export type Affiliate = {
  key: string
  label: string // one honest line shown to the visitor
  cta: string // button text
  url: string // affiliate link from env; '' = inactive (renders nothing)
}

const AFFILIATES: Record<string, Affiliate> = {
  jobcopilot: {
    key: 'jobcopilot',
    label: 'Applying to a lot of jobs? JobCopilot auto-fills and submits applications for you.',
    cta: 'Try JobCopilot',
    url: process.env.NEXT_PUBLIC_AFF_JOBCOPILOT ?? 'https://jobcopilot.com/?linkId=lp_494205&sourceId=youngalgy&tenantId=jobcopilot',
  },
  resumeio: {
    key: 'resumeio',
    label: 'Make sure your resume gets past the screen. Build an ATS-ready one with Resume.io.',
    cta: 'Build my resume',
    url: process.env.NEXT_PUBLIC_AFF_RESUMEIO ?? '',
  },
  finalround: {
    key: 'finalround',
    label: 'Interview coming up? Final Round AI helps you practice and prep.',
    cta: 'Prep my interview',
    url: process.env.NEXT_PUBLIC_AFF_FINALROUND ?? 'https://www.finalroundai.com/?via=88db34',
  },
  coursera: {
    key: 'coursera',
    label: 'Switching fields? Earn a job-ready certificate on Coursera.',
    cta: 'Browse certificates',
    url: process.env.NEXT_PUBLIC_AFF_COURSERA ?? '',
  },
}

/** Returns the program only if its link is configured, else null (renders nothing). */
export function getAffiliate(key: string): Affiliate | null {
  const a = AFFILIATES[key]
  if (!a || !a.url) return null
  return a
}
