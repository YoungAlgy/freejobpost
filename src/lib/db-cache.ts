import type { SupabaseClient } from '@supabase/supabase-js'

export const DB_CACHE_WRITE_TIMEOUT_MS = 2000

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

  // Never persist an empty result. compute() degrades to [] instead of throwing
  // during `phase-production-build` (see the matrix helpers), so without this a
  // single DB hiccup at build time writes [] and every matrix surface — the
  // sitemap's matrix URLs, the hub peer-link blocks, generateStaticParams —
  // serves "no viable cells" for the full TTL. A miss costs one indexed
  // aggregate; a cached empty costs the whole long-tail SEO surface for 6h.
  // (The specialty_state_matrix row was sitting at exactly this value — a
  // 5-byte [] — when the oversized-write bug was found on 2026-08-19.)
  if (Array.isArray(fresh) && fresh.length === 0) return fresh

  // Workers can terminate an invocation as soon as its response resolves.
  // Leaving this RPC detached lets request-bound I/O continue past that
  // boundary, while awaiting without a limit can turn a cache write into a
  // response hang. Abort after a short deadline. The fresh value remains valid
  // even when its best-effort cache write fails.
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error(`cache write timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`))
    }, DB_CACHE_WRITE_TIMEOUT_MS)
  })

  try {
    const write = db
      .rpc('set_matrix_cache', {
        p_key: key,
        p_value: fresh as object,
      })
      .abortSignal(controller.signal)
    const { error } = await Promise.race([write, deadline])
    if (error) console.error(`[db-cache] set_matrix_cache(${key}) failed:`, error.message)
  } catch (err) {
    if (controller.signal.aborted) {
      console.error(
        `[db-cache] set_matrix_cache(${key}) timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`,
      )
    } else {
      console.error(`[db-cache] set_matrix_cache(${key}) threw:`, err)
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }

  return fresh
}
