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
//
// The custom fetch wrapper opts into Next's Data Cache — without it supabase-js
// sets cache:'no-store', which forces every page dynamic.
//
// IMPORTANT (2026-05-28 cost pass): this fetch revalidate is a FLOOR on how
// often every DB-backed page regenerates. Next uses the LOWEST of (segment
// `export const revalidate`, all fetch revalidates) — so a page's *longer*
// revalidate (jobs/[slug]=24h, the specialty/state/city matrix=6h, /jobs=4h)
// CANNOT take effect while this is shorter. At the old 300s, every content
// page — thousands of SSG matrix pages plus the job surface — regenerated
// every 5 minutes on crawl regardless of its own config. That was a major
// Vercel-invocation driver, and the earlier per-page revalidate bumps were
// silently capped to 5m by this line.
//
// Raised to 3600 (1h): 12x fewer regens. 1h is also the SHORTEST page
// revalidate (homepage), so regen-frequency == this fetch cache — meaning
// data is never staler than 1h (no multi-hour staleness from a longer floor).
// Job content is immutable post-ingest and the ingest cron runs every 4h, so
// 1h freshness is plenty. (Honoring the longer per-page tiers EXACTLY would
// need per-page clients; 1h is the safe global sweet spot. Feeds use
// supabaseFresh below + their own s-maxage, so they're unaffected.)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        next: { revalidate: 3600 },
      } as RequestInit)
    },
  },
})

// supabaseFresh — historically a `cache: 'no-store'` client for /jobs.xml +
// /feeds/*.xml, to dodge a cross-deploy stale-cache bug (the Next fetch cache
// persists across deploys keyed on URL+headers; in 2026-05 a syndication_targets
// backfill left /feeds/talent.xml serving 425 stale jobs for ~7h).
//
// ⚠️ 2026-05-30 PRODUCTION INCIDENT — no-store was REMOVED (now aliases the
// cached client). The no-store path re-ran ALL 40 PostgREST batch queries on
// EVERY feed render. Under crawler concurrency (amplified by rapid deploys + a
// missing (updated_at,id) index → 14-17s full sorts) this exhausted PostgREST's
// connection pool and drove jobs.xml/talent/glassdoor/adzuna to HTTP 000 for an
// extended window. Crucially, the feeds that STAYED UP the whole time —
// /sitemap.xml and /feeds/linkedin.xml — both use the cached `supabase` client:
// it caches the batch results for 1h, so each feed touches the DB at most once
// an hour instead of on every render, and CONVERGES (one regen → cached → no
// repeated load) instead of flooding.
//
// So supabaseFresh now === supabase. Trade-off: feed data can lag up to ~1h vs
// the old per-render freshness — an acceptable price for staying UP. Jobs are
// immutable post-ingest and the ingest cron runs every 4h, so 1h is plenty. The
// (updated_at,id) partial index added the same day keeps the hourly regen fast.
// (If the cross-deploy 425-stuck bug ever resurfaces, prefer a SHORT explicit
// per-feed revalidate over reinstating no-store.)
export const supabaseFresh = supabase
