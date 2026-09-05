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
 * A failed or invalid count fails closed at runtime before any range-query
 * fan-out. During a production build callers may opt into an empty fallback,
 * preserving the existing build-time behavior without adding failed reads.
 */
export async function activeJobBatchCount(
  supabase: SupabaseClient,
  signal?: AbortSignal,
  allowBuildFallback = false,
): Promise<number> {
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
      // would defeat reuse wherever the deployed fetch cache is enabled.
      // A stable URL does not by itself guarantee caching on dynamic routes.
      .gt('expires_at', hourIso())
      .retry(false)
      .abortSignal(signal ?? new AbortController().signal)
    if (
      typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count >= 0 &&
      !error
    ) {
      const needed = Math.ceil(count / BATCH_SIZE) + BATCH_HEADROOM
      return Math.min(Math.max(needed, MIN_BATCHES), MAX_BATCHES)
    }
    throw new Error(
      `active job count failed${error ? `: ${error.message}` : ' with an invalid result'}`,
    )
  } catch (error) {
    // Builds previously tolerated a database error by emitting an empty feed.
    // Retain that behavior, but avoid the old fallback's extra range-query load.
    if (allowBuildFallback) return 0
    throw error
  }
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
    const settled = await Promise.allSettled(
      Array.from(
        { length: Math.min(BATCH_CONCURRENCY, numBatches - start) },
        // Defer invocation so a synchronous throw from one callback cannot
        // prevent Promise.allSettled from observing and settling work started
        // by an earlier callback in this same wave.
        (_, j) => Promise.resolve().then(() => runBatch(start + j)),
      ),
    )
    // Await every started query before surfacing an unexpected rejection. This
    // keeps no request-bound database I/O detached from the route lifecycle.
    const rejected = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (rejected) throw rejected.reason
    const chunk = settled.map((result) => {
      if (result.status !== 'fulfilled') throw new Error('unreachable batch settlement')
      return result.value
    })
    results.push(...chunk)
    // Do not start another wave after a resolved PostgREST error. The callers
    // still inspect the settled result and fail closed, but an outage cannot
    // turn one failed wave into dozens of additional range reads.
    if (
      chunk.some((result) =>
        Boolean((result as { error?: unknown } | null | undefined)?.error),
      )
    ) break
  }
  return results
}
