import type { SupabaseClient } from '@supabase/supabase-js'

// Postgres-backed replacement for unstable_cache() (2026-08-13). Next's Data
// Cache wasn't persisting on this OpenNext/Cloudflare deploy for the viable-
// matrix-cells family -- confirmed via the D1 tag-cache having zero entries
// for these keys despite the underlying RPC being called 25,000+ times in a
// few hours. Postgres has been the one reliably-caching layer all along, so
// this pushes the cache there instead of debugging Next/OpenNext internals
// further. See migration matrix_cache_table_and_rpcs for the schema.
//
// Not request-coalesced: a burst of concurrent callers on a cold/expired
// entry can each recompute once before the first write lands. Acceptable
// here -- the computations this wraps are ~0.3s single indexed queries, so
// even a several-way herd is far cheaper than what unstable_cache's silent
// failure was actually costing (thousands of uncached calls).
export async function getOrComputeCached<T>(
  db: SupabaseClient,
  key: string,
  maxAgeSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const { data: cached, error: readError } = await db.rpc('get_matrix_cache', {
    p_key: key,
    p_max_age_seconds: maxAgeSeconds,
  })
  if (readError) {
    console.error(`[db-cache] get_matrix_cache(${key}) failed:`, readError.message)
  } else if (cached != null) {
    return cached as T
  }

  const fresh = await compute()

  // Fire-and-forget: a cache-write failure shouldn't fail the response that
  // already has a good value to return. Both branches (RPC resolves with an
  // error field, or the call itself rejects e.g. on a network fault) are
  // caught here so neither surfaces as an unhandled promise rejection.
  // supabase-js's .rpc() returns a PromiseLike, not a real Promise -- it has
  // no .catch(), so both branches are handled via .then()'s two-argument form.
  db.rpc('set_matrix_cache', { p_key: key, p_value: fresh as object }).then(
    ({ error }) => {
      if (error) console.error(`[db-cache] set_matrix_cache(${key}) failed:`, error.message)
    },
    (err) => {
      console.error(`[db-cache] set_matrix_cache(${key}) threw:`, err)
    }
  )

  return fresh
}
