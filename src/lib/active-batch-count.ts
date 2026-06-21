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
