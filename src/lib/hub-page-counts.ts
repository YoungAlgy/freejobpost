// Per-hub active-job counts, used to work out how many paginated /p/<n> URLs
// each hub actually has.
//
// WHY THIS EXISTS: when the hub pages were paginated (2026-08-19, see
// src/lib/hub-pagination.ts) the continuation URLs had to be discoverable. They
// already are via the crawlable <a href> pagination nav on page 1, but
// pages.xml should list them too — and a sitemap must never advertise a URL
// that 404s, so "how many pages does /state/florida have" has to be a real
// number, not ceil(the family cap / page size) applied blindly to every hub.
// Florida has 300 jobs and 3 pages; Vermont has 94 and exactly 1, and listing a
// /state/vermont/p/2 that 404s is worse than listing nothing.
//
// COST: one head-count per hub across the four top-level families
// (50 states + 33 specialties + 32 cities + 5 federal agencies = ~120 queries).
// They run through runBatchesConcurrencyCapped so this is 8-at-a-time, never a
// 120-wide burst at the shared Nano Postgres — the failure mode
// active-batch-count.ts was written to prevent. The whole set is then cached in
// Postgres for 6h via getOrComputeCached, the pattern this repo settled on after
// Next's Data Cache was found not to persist on this OpenNext/Cloudflare deploy
// (2026-08-13). So the real cost is ~120 counted queries per 6h globally.
//
// The two matrix families (specialty×state, federal agency×state) are NOT here:
// their per-cell counts already come free from the viable-cell helpers the
// sitemap calls anyway.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hourIso } from '@/lib/supabase'
import { getOrComputeCached } from '@/lib/db-cache'
import { hubPageStaticParams } from '@/lib/hub-pagination'
import { runBatchesConcurrencyCapped } from '@/lib/active-batch-count'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'
import { STATE_HUBS } from '@/lib/state-slugs'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { FEDERAL_AGENCIES, agencyOrFilter } from '@/lib/federal-agencies'
import { cityOrFilter } from '@/lib/hub-job-queries'

export type HubKind = 'state' | 'specialty' | 'city' | 'federalAgency'

/** One hub's active-job count. A flat array, not a nested object, on purpose —
 *  getOrComputeCached refuses to persist an empty ARRAY, so a total DB failure
 *  degrades to "no paginated URLs in the sitemap this cycle" instead of poisoning
 *  the cache with all-zero counts for 6h. (That exact class of bug — caching a
 *  5-byte `[]` and serving it as truth — is what bit the matrix cache on
 *  2026-08-19.) */
export type HubCount = { kind: HubKind; slug: string; count: number }

type CountTask = { kind: HubKind; slug: string; run: () => PromiseLike<{ count: number | null }> }

function buildTasks(db: SupabaseClient): CountTask[] {
  const nowIso = hourIso()
  // Hour-stable timestamp so each PostgREST URL is byte-identical within the
  // hour and these counts can actually hit a cache (the F52 lesson).
  const base = () =>
    db
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)

  const tasks: CountTask[] = []

  // Each of these must match its family's fetch in hub-job-queries.ts exactly,
  // or the page count derived here disagrees with the pages the route serves.
  for (const s of STATE_HUBS) {
    tasks.push({ kind: 'state', slug: s.slug, run: () => base().eq('state', s.abbr) })
  }
  for (const s of SPECIALTY_HUBS) {
    tasks.push({
      kind: 'specialty',
      slug: s.slug,
      run: () => base().or(buildSpecialtyOrFilter(s.matchPatterns)),
    })
  }
  for (const c of CITY_HUBS) {
    tasks.push({
      kind: 'city',
      slug: c.slug,
      run: () => base().eq('state', c.state).or(cityOrFilter(c.cityMatchPatterns)),
    })
  }
  for (const a of FEDERAL_AGENCIES) {
    tasks.push({
      kind: 'federalAgency',
      slug: a.slug,
      run: () => base().eq('source', 'usajobs:federal').or(agencyOrFilter(a)),
    })
  }
  return tasks
}

async function computeHubCounts(db: SupabaseClient): Promise<HubCount[]> {
  const tasks = buildTasks(db)
  const results = await runBatchesConcurrencyCapped(tasks.length, (i) => tasks[i].run())

  const out: HubCount[] = []
  for (let i = 0; i < tasks.length; i++) {
    const n = results[i]?.count
    // Skip rather than record 0 on a failed count. A recorded 0 would mean "this
    // hub has exactly one page", silently dropping its real continuation URLs
    // from the sitemap for the full 6h TTL. Skipping means the same thing for
    // this cycle but does not pretend to know.
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      out.push({ kind: tasks[i].kind, slug: tasks[i].slug, count: n })
    }
  }
  return out
}

/**
 * Cached per-hub counts, keyed by kind+slug. 6h TTL, Postgres-backed.
 *
 * NEVER THROWS. The sitemap is the single most important surface on the site;
 * if these counts are unavailable, pages.xml should lose its paginated URLs for
 * one cycle, not fail to build. The continuation pages stay crawlable through
 * the on-page pagination nav regardless.
 */
export async function getHubPageCountsCached(
  db: SupabaseClient,
): Promise<Map<string, number>> {
  let rows: HubCount[] = []
  try {
    rows = await getOrComputeCached(db, 'hub-page-counts-v1', 21600, () => computeHubCounts(db))
  } catch (err) {
    console.error('[hub-page-counts] count scan failed, omitting paginated sitemap URLs:', err)
    return new Map()
  }
  const map = new Map<string, number>()
  for (const r of rows ?? []) map.set(`${r.kind}:${r.slug}`, r.count)
  return map
}

export function hubCountKey(kind: HubKind, slug: string): string {
  return `${kind}:${slug}`
}

/**
 * The continuation page numbers ('2', '3', …) that actually exist for one hub,
 * for a /p/[page] route's generateStaticParams.
 *
 * WHY NOT just prerender ceil(familyLimit / HUB_PAGE_SIZE) for every hub: the
 * first build that did exactly that produced 435 prerendered 404s out of 1,138
 * continuation entries — 39MB of R2 objects that exist only to say "no". This
 * account is already over the 10GB R2 free tier, so paying 39MB per deploy for
 * pages nobody can visit is not a rounding error.
 *
 * Returns [] when the count is unknown (the scan failed). Every /p/[page] route
 * keeps dynamicParams=true, so an unlisted page still renders on demand and
 * ISR-caches instead of 404ing — a missing count costs a slow first hit, never
 * a wrong answer. The same Map drives the sitemap, so what gets prerendered and
 * what gets advertised cannot drift apart.
 */
export function hubContinuationPages(
  counts: Map<string, number>,
  kind: HubKind,
  slug: string,
  familyLimit: number,
): string[] {
  const counted = counts.get(hubCountKey(kind, slug))
  if (counted === undefined) return []
  return hubPageStaticParams(Math.min(counted, familyLimit)).map((p) => p.page)
}
