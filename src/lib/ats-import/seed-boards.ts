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
    provider: 'lever',
    boardSlug: 'lyrahealth',
    companyName: 'Lyra Health',
    companyUrl: 'https://www.lyrahealth.com',
    employerSlug: 'lyra-health',
  },
]
