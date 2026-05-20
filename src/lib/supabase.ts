import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (dev) ' +
    'or in Vercel project settings (prod).'
  )
}

// Single anon client shared across RSC renders.
// The custom fetch wrapper opts into Next's ISR cache — without it supabase-js
// sets no-store which forces every render dynamic. Per-page `export const
// revalidate` overrides the 300s default when a page needs fresher data.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        next: { revalidate: 300 },
      } as RequestInit)
    },
  },
})

// Separate anon client that bypasses the Next.js fetch cache. Used by
// /jobs.xml + /feeds/*.xml.
//
// Why bypass the fetch cache? The Next.js fetch cache PERSISTS ACROSS
// DEPLOYMENTS (per Next docs). After the 2026-05-20 syndication_targets
// backfill changed which rows match a fetched query, the cached PostgREST
// batch responses on the main `supabase` client (which has
// `revalidate: 300`) kept returning the pre-backfill row counts even
// after multiple redeploys — the fetch cache is keyed on URL+headers, not
// on which Supabase client object initiated the request, so a new client
// with shorter revalidate would still HIT the same stale entries.
//
// Result: /feeds/talent.xml stuck at 425 jobs for ~7 hours after the DB
// went to 8,961. Multiple background SWR cycles kept serving the same
// stale body, extending the de-facto cache lifetime indefinitely.
//
// Fix: `cache: 'no-store'` skips the shared fetch cache entirely. Feed
// routes still benefit from outer ISR (revalidate=900 on each route)
// which caches the final rendered XML response — but the underlying
// PostgREST queries are fresh on every render. Wall-time cost is
// negligible (PostgREST batch queries take <500ms).
//
// Page-rendering paths still use the 300s `supabase` export; this only
// affects feeds.
export const supabaseFresh = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        cache: 'no-store',
      } as RequestInit)
    },
  },
})
