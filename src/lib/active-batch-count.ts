import type { SupabaseClient } from '@supabase/supabase-js'

// Count-based batch sizing for the full-active-inventory `.range()` fetches that
// power the syndication feeds, the XML sitemap, and the specialty/city matrix
// surfaces. Replaces the old fixed `NUM_BATCHES = 30` (30K-row) ceiling that
// silently truncated feeds + sitemap once active inventory passed 30K (jobs
// beyond row 30K vanished from partner feeds + Google discovery). This is the
// permanent fix the in-code comments kept deferring ("switch to count-based
// paging before 30K"); freeresumepost's homepage/upload already use the same
// pattern.
//
// Returns ceil(activeCount / 1000) batches (+1 margin to cover jobs added
// between the count and the fetch), so we fetch exactly the inventory — no
// ceiling, no wasted empty windows. Bounded by MAX_BATCHES as a runaway guard.
//
// SAFETY: the count uses the BASE active filter (status='active', not deleted,
// not expired) — an UPPER BOUND for the syndication-filtered feeds (which fetch
// a subset), so they can never under-fetch. And if the count query errors or
// returns null, we fall back to COUNT_FALLBACK_BATCHES (generous) rather than
// 1 — a failed count must never truncate a feed. Process-memoized (10-min TTL)
// so the dozen-ish feed/sitemap/matrix renders in one worker share one count.
const BATCH_SIZE = 1000
const MAX_BATCHES = 60 // ~60K active jobs — runaway guard (re-raise as inventory grows)
const COUNT_FALLBACK_BATCHES = 40 // count query failed → fetch generously, never truncate
const TTL_MS = 10 * 60 * 1000

let _cache: { at: number; n: number } | null = null

/**
 * Number of 1,000-row `.range()` batches needed to cover the full active-job
 * inventory. Pass the same supabase client used for the batched fetch.
 */
export async function activeJobBatchCount(supabase: SupabaseClient): Promise<number> {
  const now = Date.now()
  if (_cache && now - _cache.at < TTL_MS) return _cache.n

  const { count, error } = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())

  const n =
    error || count == null
      ? COUNT_FALLBACK_BATCHES
      : Math.min(MAX_BATCHES, Math.max(1, Math.ceil(count / BATCH_SIZE) + 1))

  _cache = { at: now, n }
  return n
}
