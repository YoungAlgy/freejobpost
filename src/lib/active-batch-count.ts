import type { SupabaseClient } from '@supabase/supabase-js'

// Number of 1,000-row `.range()` batches used to cover the full active-job
// inventory in the syndication feeds, the XML sitemap, and the matrix helpers.
//
// ⚠️ 2026-05-30 — COUNT-BASED PAGING REVERTED TO A FIXED VALUE.
// Wiring in true count-based paging (commit e63c2e0: numBatches =
// ceil(activeCount/1000)) caused jobs.xml + EVERY partner feed to FLAP in prod
// within minutes of deploy — sampled 7368 ↔ 2314 ↔ 627 ↔ 0 jobs. Root cause:
// the head-count query (`select('id', { count:'exact', head:true })`) returned
// wildly inconsistent values (0, ~3.5K, ~16.8K) through the `supabaseFresh` /
// Next-fetch-cache path under heavy crawler concurrency, collapsing numBatches
// (a transient 0 → numBatches 1) and silently truncating the feeds. Caught by
// the post-deploy feed monitor.
//
// So this returns a FIXED batch count for now — stable (no count dependency),
// same approach as the prior `NUM_BATCHES = 30` but with more headroom.
//
// 2026-06-21 audit: bumped 40 → 60 (a ~60K active-job ceiling). The binding
// consumer is the specialty×state / city×specialty matrix scan, which pages the
// FULL active corpus (NO description filter). Active inventory hit 31,208 — past
// the "bump before 30K" trigger flagged in sitemap.ts, and only ~22% under the
// old 40K ceiling. Beyond the ceiling the matrix scan drops the OLDEST active
// jobs (ordered updated_at DESC), which knocks near-threshold (specialty,state)
// cells below the ≥5 floor and out of the sitemap + generateStaticParams — a
// silent SEO-surface loss. The sitemap (~19K indexable, description_usable_chars
// >= 250) and the partner feeds (~5K feed-eligible) page FILTERED subsets, so
// they still had room; the matrix is the one that binds.
//
// DURABLE FIX (deferred, bigger change): compute the viable cells with a real
// SQL GROUP BY instead of pulling the whole corpus into JS — the function is
// even named computeViableCellsViaSql but actually does a JS scan. The
// count-based paging impl is in git at commit e63c2e0; re-enable it only with a
// dedicated/uncached count (the cached one flapped in prod, see above).
const FIXED_BATCHES = 60

/**
 * Number of 1,000-row `.range()` batches needed to cover the active-job
 * inventory. Currently a stable fixed value (see the note above). The
 * `supabase` param is retained so call sites don't change when count-based
 * paging is re-enabled.
 */
export async function activeJobBatchCount(_supabase: SupabaseClient): Promise<number> {
  void _supabase // retained for the call sites; unused while count-based is off
  return FIXED_BATCHES
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
