import type { SupabaseClient } from '@supabase/supabase-js'
import { hourIso } from './supabase'

// Number of 1,000-row `.range()` batches used to cover the full active-job
// inventory in the syndication feeds and the XML sitemap.
//
// ⚠️ 2026-05-30 — COUNT-BASED PAGING WAS REVERTED TO A FIXED VALUE ONCE.
// Wiring in naive count-based paging (commit e63c2e0: numBatches =
// ceil(activeCount/1000)) caused jobs.xml + EVERY partner feed to FLAP in prod
// within minutes of deploy — sampled 7368 ↔ 2314 ↔ 627 ↔ 0 jobs. Root cause:
// the head-count query (`select('id', { count:'exact', head:true })`) returned
// wildly inconsistent values (0, ~3.5K, ~16.8K) through the `supabaseFresh` /
// Next-fetch-cache path under heavy crawler concurrency, collapsing numBatches
// (a transient 0 → numBatches 1) and silently truncating the feeds.
//
// 2026-06-21 audit: bumped the fixed value 40 → 60 (a ~60K active-job ceiling).
//
// ✅ 2026-08-19 — COUNT-BASED PAGING RE-ENABLED, SAFELY THIS TIME.
// The fixed 60 was ~6K away from binding again (active corpus 49,324 and
// growing), and past the ceiling the batches silently drop the OLDEST active
// jobs (every caller orders updated_at DESC) — jobs vanish from the sitemap and
// the partner feeds with no error anywhere.
//
// The 2026-05-30 failure mode was NOT "counting is wrong", it was "a bad count
// SHRANK coverage". So the count now only ever ADDS batches: the result is
// clamped to a MIN_BATCHES floor equal to the old proven-safe fixed value, so
// every garbage value from that incident (0, 3.5K, 16.8K → 5, 9, 22 batches)
// clamps straight back to 60 and behaves exactly like today. Truncation by
// bad count is impossible by construction, which is what makes it safe to read
// the count through the caller's ordinary cached client. MAX_BATCHES bounds the
// other direction so a runaway/garbage-high count can't spin up an unbounded
// number of concurrent range queries.
//
// Net effect today: still 60 batches (the floor). Once the real corpus passes
// ~55K it grows on its own instead of silently truncating and waiting for
// someone to notice and bump a constant.
const BATCH_SIZE = 1000
// Floor = the previous fixed value. Coverage can never regress below what this
// module already guaranteed, no matter what the count query returns.
const MIN_BATCHES = 60
// Ceiling on a runaway count (200 batches = 200K active jobs, ~4x current).
const MAX_BATCHES = 200
// Slack over the counted requirement: rows are inserted between the count and
// the reads, and offset pagination over a table still being written to can
// shift rows across batch windows.
const BATCH_HEADROOM = 5

/**
 * Number of 1,000-row `.range()` batches needed to cover the active-job
 * inventory, derived from a real COUNT of the active corpus and clamped to
 * [MIN_BATCHES, MAX_BATCHES]. See the note above for why the clamp (not the
 * count) is the part that makes this safe.
 *
 * Counts the BROADEST predicate any caller uses (status=active, not deleted,
 * not expired). Callers that additionally filter (e.g. a description-length
 * floor) match a subset, so this over-provisions for them — extra batches
 * past the end of a result set come back empty and contribute nothing.
 *
 * Never throws: any failure falls back to MIN_BATCHES.
 */
export async function activeJobBatchCount(supabase: SupabaseClient): Promise<number> {
  let activeCount: number | null = null
  try {
    const { count, error } = await supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
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
    return MIN_BATCHES
  }

  const needed = Math.ceil(activeCount / BATCH_SIZE) + BATCH_HEADROOM
  return Math.min(Math.max(needed, MIN_BATCHES), MAX_BATCHES)
}

// 2026-08-12 — every caller of activeJobBatchCount() was firing its batches
// via a single Promise.all, i.e. up to FIXED_BATCHES (60) simultaneous
// 1000-row range queries against the shared Nano Postgres instance. One
// caller (specialty-state-matrix.ts) was capped to 8-at-a-time on 2026-08-07
// after pg_stat_statements confirmed it as the dominant disk-block-read
// consumer during that outage — but city-specialty-matrix.ts, sitemap.ts,
// feed-builders.ts (7 partner-feed routes), and linkedin.xml/route.ts all
// still fired the full uncapped burst, and (unlike the matrix helpers) the
// feed routes are force-dynamic with no unstable_cache layer at all, so
// they re-fire on every uncached crawler hit (Indeed/LinkedIn/Adzuna/etc,
// on schedules Algy doesn't control) — which is why the outage persisted
// across DB restarts that don't touch an external crawler's poll schedule.
// Centralizing the concurrency cap here so every caller gets it instead of
// each one hand-rolling (and potentially forgetting) the same loop.
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
