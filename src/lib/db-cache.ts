import type { SupabaseClient } from '@supabase/supabase-js'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'

export const DB_CACHE_WRITE_TIMEOUT_MS = 2000

export type DbCacheOptions = {
  signal?: AbortSignal
}

export function dbCacheWritesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD &&
    env.FREEJOBPOST_RELEASE_BUILD !== '1'
  )
}

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
  compute: (signal?: AbortSignal) => Promise<T>,
  options: DbCacheOptions = {},
): Promise<T> {
  const read = db.rpc('get_matrix_cache', {
    p_key: key,
    p_max_age_seconds: maxAgeSeconds,
  })
  const { data: cached, error: readError } = await (options.signal
    ? read.abortSignal(options.signal)
    : read)
  if (readError) {
    console.error(`[db-cache] get_matrix_cache(${key}) failed:`, readError.message)
  } else if (cached != null && !(Array.isArray(cached) && cached.length === 0)) {
    return cached as T
  }

  const fresh = await compute(options.signal)

  // Never persist an empty result. compute() degrades to [] instead of throwing
  // during `phase-production-build` (see the matrix helpers), so without this a
  // single DB hiccup at build time writes [] and every matrix surface — the
  // sitemap's matrix URLs, the hub peer-link blocks, generateStaticParams —
  // serves "no viable cells" for the full TTL. A miss costs one indexed
  // aggregate; a cached empty costs the whole long-tail SEO surface for 6h.
  // (The specialty_state_matrix row was sitting at exactly this value — a
  // 5-byte [] — when the oversized-write bug was found on 2026-08-19.)
  if (Array.isArray(fresh) && fresh.length === 0) return fresh

  // `next build` sets NEXT_PHASE before starting its static workers. The
  // sanitized OpenNext release wrapper also sets FREEJOBPOST_RELEASE_BUILD for
  // every child process. Either signal makes the build read-only, including
  // wrapper phases before and after Next's own build workers. Runtime requests
  // use neither signal and keep the normal Postgres-backed cache write below.
  if (!dbCacheWritesAllowed()) return fresh

  // Workers can terminate an invocation as soon as its response resolves.
  // Leaving this RPC detached lets request-bound I/O continue past that
  // boundary, while awaiting without a limit can turn a cache write into a
  // response hang. Abort after a short deadline. The fresh value remains valid
  // even when its best-effort cache write fails.
  if (options.signal?.aborted) return fresh

  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, DB_CACHE_WRITE_TIMEOUT_MS)

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  try {
    // PostgREST builders are thenables. Normalize exactly once so awaiting the
    // abort settlement cannot execute the RPC a second time.
    const write = Promise.resolve(
      db
        .rpc('set_matrix_cache', {
          p_key: key,
          p_value: fresh as object,
        })
        .abortSignal(signal),
    )
    const { error } = await write
    if (timedOut) {
      console.error(
        `[db-cache] set_matrix_cache(${key}) timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`,
      )
    } else if (error) {
      console.error(`[db-cache] set_matrix_cache(${key}) failed:`, error.message)
    }
  } catch (err) {
    if (timedOut) {
      console.error(
        `[db-cache] set_matrix_cache(${key}) timed out after ${DB_CACHE_WRITE_TIMEOUT_MS}ms`,
      )
    } else {
      console.error(`[db-cache] set_matrix_cache(${key}) threw:`, err)
    }
  } finally {
    clearTimeout(timeoutId)
  }

  return fresh
}
