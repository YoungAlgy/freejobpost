import type { SupabaseClient } from '@supabase/supabase-js'
import { hourIso } from './supabase'
import {
  PUBLIC_EMPLOYER_JOB_SOURCE,
  PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN,
} from './public-jobs'

// Number of 1,000-row range batches used by outbound partner feeds. The former
// aggregate product kept a 60-batch floor, which meant 60 database queries even
// when the standalone direct-employer inventory fit in one batch.
const BATCH_SIZE = 1000
const MIN_BATCHES = 1
const FALLBACK_BATCHES = 5
const MAX_BATCHES = 100
// One extra batch protects posts added between the count and range queries.
const BATCH_HEADROOM = 1

/**
 * Number of 1,000-row `.range()` batches needed to cover the active-job
 * inventory, derived from a real count of the direct-employer corpus and
 * clamped to [MIN_BATCHES, MAX_BATCHES].
 *
 * Counts the direct-employer corpus (source=public_employer_post, active, not
 * deleted, not expired). Callers that additionally filter match a subset, so
 * extra batches past the end of a result set come back empty.
 *
 * Never throws. A failed count still covers 5,000 rows so a transient count
 * problem cannot collapse a populated feed to one batch.
 */
export async function activeJobBatchCount(supabase: SupabaseClient): Promise<number> {
  let activeCount: number | null = null
  try {
    const { count, error } = await supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
      .eq('status', 'active')
      .is('deleted_at', null)
      // hourIso, not a raw new Date(): a per-render timestamp changes the
      // PostgREST URL, which changes the Next Data Cache key, so the count
      // would re-hit the DB on EVERY render (the F52 bug). Hour-stable means
      // one count per hour globally instead of one per crawler hit.
      .gt('expires_at', hourIso())
    if (!error) activeCount = count
  } catch {
    // Network/transport fault — fall through to the floor.
  }

  if (typeof activeCount !== 'number' || !Number.isFinite(activeCount) || activeCount < 0) {
    return FALLBACK_BATCHES
  }

  const needed = Math.ceil(activeCount / BATCH_SIZE) + BATCH_HEADROOM
  return Math.min(Math.max(needed, MIN_BATCHES), MAX_BATCHES)
}

// Keep a shared ceiling if the direct inventory grows beyond one request.
const BATCH_CONCURRENCY = 8

export { BATCH_CONCURRENCY }

/**
 * Runs `numBatches` range-query batches with at most BATCH_CONCURRENCY in
 * flight at once, instead of one Promise.all over all of them. Same total
 * queries, same total data — just spread out instead of hitting the shared
 * DB as one wide burst. See the note above for why this matters.
 */
export async function runBatchesConcurrencyCapped<T>(
  numBatches: number,
  // PromiseLike, not Promise: Supabase's query builder is thenable but not a
  // real Promise (no .catch/.finally), which is what callers pass in here.
  runBatch: (batchIndex: number) => PromiseLike<T>,
): Promise<T[]> {
  const results: T[] = []
  for (let start = 0; start < numBatches; start += BATCH_CONCURRENCY) {
    const chunk = await Promise.all(
      Array.from(
        { length: Math.min(BATCH_CONCURRENCY, numBatches - start) },
        (_, j) => runBatch(start + j),
      ),
    )
    results.push(...chunk)
  }
  return results
}
