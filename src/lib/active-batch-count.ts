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
// same approach as the prior `NUM_BATCHES = 30` but with more headroom. 40 ×
// 1,000 = a ~40K active-job ceiling; bump if inventory approaches it. The full
// count-based implementation is preserved in git history at commit e63c2e0 —
// re-enable it only once the count query is proven stable in prod (it likely
// needs a dedicated/uncached count, not the cached supabaseFresh client).
const FIXED_BATCHES = 40

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
