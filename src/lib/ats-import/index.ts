// Unified entry point for the ATS importer.
//
// Usage:
//   const r = await importAtsBoard('greenhouse', 'oscar')
//   const r = await importAtsBoard('lever', 'lyrahealth')
//
// Returns an ImportResult with the normalized + filtered jobs ready to upsert
// into public_jobs. The DB writer (next phase) handles dedupe by
// (source, external_id) + creates the employer row if needed.

import type { AtsProvider, ImportResult } from './types'
import { fetchGreenhouseBoard } from './greenhouse'
import { fetchLeverBoard } from './lever'

export async function importAtsBoard(
  provider: AtsProvider,
  boardSlug: string,
): Promise<ImportResult> {
  if (provider === 'greenhouse') return fetchGreenhouseBoard(boardSlug)
  if (provider === 'lever') return fetchLeverBoard(boardSlug)
  throw new Error(`Unsupported ATS provider: ${provider}`)
}

export type { AtsProvider, ImportResult, ExternalJob } from './types'
export { parseUsLocation } from './locations'
export { isHealthcareRelevant } from './healthcare-filter'
export { htmlToText } from './html-to-text'
