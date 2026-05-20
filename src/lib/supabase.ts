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

// Separate anon client with a 30s fetch revalidate window, used by
// /jobs.xml + /feeds/*.xml.
//
// Why a separate client? After the 2026-05-20 syndication_targets backfill
// changed which rows match a fetched query, the 300s revalidate on the
// main client combined with the routes' 900s outer-ISR window pinned
// /feeds/talent.xml et al at the pre-backfill row count (425) for 6+ hours
// after the migration applied. The PostgREST batch responses were cached
// pre-migration; each batch's revalidate window only refreshed on a hit to
// that specific URL/range combination; outer ISR served the stale wrapper
// while inner revalidations ran. Even a `git push --allow-empty` redeploy
// didn't bust it because the fetch cache survives across same-bundle
// deploys.
//
// 30s here keeps the cache responsive after data-shape migrations while
// preserving most of the per-render benefit. Feed routes are the only
// callers — page-rendering paths still use the 300s `supabase` export.
export const supabaseFresh = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        next: { revalidate: 30 },
      } as RequestInit)
    },
  },
})
