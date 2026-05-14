// Curated list of healthcare-employer ATS boards we know are public + active.
//
// Each entry is verified manually (board returns 200 OK, jobs are real healthcare
// roles, employer is a real US healthcare company). The cron runs every 4h
// against this list. To add/remove a board, edit this file + ship.
//
// IMPORTANT: Greenhouse + Lever publish these boards as public, no-auth APIs
// by design. We're not scraping; we're consuming the same JSON their own
// careers pages render from. Each imported job clearly attributes the source
// in its slug (e.g. ".../jobs/medical-director-gh-7914907") and links straight
// to the employer's own apply page.

import type { BoardConfig } from './db-writer'

export const SEED_BOARDS: BoardConfig[] = [
  {
    provider: 'greenhouse',
    boardSlug: 'oscar',
    companyName: 'Oscar Health',
    companyUrl: 'https://www.hioscar.com',
    employerSlug: 'oscar-health',
  },
  {
    provider: 'greenhouse',
    boardSlug: 'onemedical',
    companyName: 'One Medical',
    companyUrl: 'https://www.onemedical.com',
    employerSlug: 'one-medical',
  },
  {
    provider: 'greenhouse',
    boardSlug: 'tia',
    companyName: 'Tia',
    companyUrl: 'https://www.asktia.com',
    employerSlug: 'tia',
  },
  {
    provider: 'greenhouse',
    boardSlug: 'bicyclehealth',
    companyName: 'Bicycle Health',
    companyUrl: 'https://www.bicyclehealth.com',
    employerSlug: 'bicycle-health',
  },
  {
    provider: 'lever',
    boardSlug: 'lyrahealth',
    companyName: 'Lyra Health',
    companyUrl: 'https://www.lyrahealth.com',
    employerSlug: 'lyra-health',
  },
  {
    provider: 'ashby',
    boardSlug: 'talkiatry',
    companyName: 'Talkiatry',
    companyUrl: 'https://www.talkiatry.com',
    employerSlug: 'talkiatry',
  },
  {
    provider: 'ashby',
    boardSlug: 'headway',
    companyName: 'Headway',
    companyUrl: 'https://www.headway.co',
    employerSlug: 'headway',
  },
  // Workday tenants (hospital systems + payers — biggest supply unlock).
  // boardSlug is "{tenant}/{site}" for human-readable identification.
  // Per-board workday config (tenantHost/tenant/site/defaultState) is on
  // the run script + edge function copies; this file is the canonical list.
  // First-time seed requires the local run script (~detail-fetch heavy);
  // cron picks up incremental updates after.
  {
    provider: 'workday',
    boardSlug: 'ccf/ClevelandClinicCareers',
    companyName: 'Cleveland Clinic',
    companyUrl: 'https://my.clevelandclinic.org',
    employerSlug: 'cleveland-clinic',
  },
  {
    provider: 'workday',
    boardSlug: 'adventhealth/AH_External_Career_Site',
    companyName: 'AdventHealth',
    companyUrl: 'https://www.adventhealth.com',
    employerSlug: 'adventhealth',
  },
  {
    provider: 'workday',
    boardSlug: 'stanfordhealthcare/SHC_External_Career_Site',
    companyName: 'Stanford Health Care',
    companyUrl: 'https://stanfordhealthcare.org',
    employerSlug: 'stanford-health-care',
  },
  {
    provider: 'workday',
    boardSlug: 'massgeneralbrigham/MGBExternal',
    companyName: 'Mass General Brigham',
    companyUrl: 'https://www.massgeneralbrigham.org',
    employerSlug: 'mass-general-brigham',
  },
  {
    provider: 'workday',
    boardSlug: 'saintlukes/saintlukeshealthcareers',
    companyName: "Saint Luke's Healthcare",
    companyUrl: 'https://www.saintlukeskc.org',
    employerSlug: 'saint-lukes-healthcare',
  },
  {
    provider: 'workday',
    boardSlug: 'elevancehealth/ANT',
    companyName: 'Elevance Health',
    companyUrl: 'https://www.elevancehealth.com',
    employerSlug: 'elevance-health',
  },
]
