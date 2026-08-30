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
// COST: one head-count per state, specialty, and city hub.
// They run through runCountTasksSettled so this is 8-at-a-time, never a
// 120-wide burst at the shared Nano Postgres — the failure mode
// active-batch-count.ts was written to prevent. The whole set is then cached in
// Postgres for 6h via getOrComputeCached, the pattern this repo settled on after
// Next's Data Cache was found not to persist on this OpenNext/Cloudflare deploy
// (2026-08-13). So the real cost is ~120 counted queries per 6h globally.
//
import type { SupabaseClient } from '@supabase/supabase-js'
import { hourIso } from '@/lib/supabase'
import { getOrComputeCached } from '@/lib/db-cache'
import { hubPageStaticParams } from '@/lib/hub-pagination'
import { BATCH_CONCURRENCY } from '@/lib/active-batch-count'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'
import { STATE_HUBS } from '@/lib/state-slugs'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { cityOrFilter } from '@/lib/hub-job-queries'
import {
  PUBLIC_EMPLOYER_JOB_SOURCE,
  PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN,
} from '@/lib/public-jobs'

export type HubKind = 'state' | 'specialty' | 'city'

/** One hub's active direct-employer job count. Zero is a real value and must be
 * retained so sitemap code can distinguish an empty hub from an unavailable
 * count scan. */
export type HubCount = { kind: HubKind; slug: string; count: number }

type CountTask = { kind: HubKind; slug: string; run: () => PromiseLike<{ count: number | null }> }

export async function runCountTasksSettled<T>(
  tasks: readonly (() => PromiseLike<T>)[],
  concurrency = BATCH_CONCURRENCY,
): Promise<T[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('count task concurrency must be a positive integer')
  }

  const results: T[] = []
  for (let start = 0; start < tasks.length; start += concurrency) {
    // Start the whole bounded batch before observing any failure. allSettled
    // keeps one rejection from returning while sibling request I/O is active.
    const settled = await Promise.allSettled(
      tasks
        .slice(start, start + concurrency)
        .map((run) => Promise.resolve().then(() => run())),
    )
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failure) throw failure.reason
    for (const result of settled) {
      if (result.status === 'fulfilled') results.push(result.value)
    }
  }
  return results
}

function buildTasks(db: SupabaseClient, signal?: AbortSignal): CountTask[] {
  const nowIso = hourIso()
  // Hour-stable timestamp so each PostgREST URL is byte-identical within the
  // hour and these counts can actually hit a cache (the F52 lesson).
  const base = () => {
    const query = db
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', nowIso)
    return signal ? query.abortSignal(signal) : query
  }

  const tasks: CountTask[] = []

  // Each of these must match its family's fetch in hub-job-queries.ts exactly,
  // or the page count derived here disagrees with the pages the route serves.
  for (const s of STATE_HUBS) {
    tasks.push({
      kind: 'state',
      slug: s.slug,
      run: () => base().eq('source', PUBLIC_EMPLOYER_JOB_SOURCE).eq('state', s.abbr),
    })
  }
  for (const s of SPECIALTY_HUBS) {
    tasks.push({
      kind: 'specialty',
      slug: s.slug,
      run: () => base().eq('source', PUBLIC_EMPLOYER_JOB_SOURCE).or(buildSpecialtyOrFilter(s.matchPatterns)),
    })
  }
  for (const c of CITY_HUBS) {
    tasks.push({
      kind: 'city',
      slug: c.slug,
      run: () => base()
        .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
        .eq('state', c.state)
        .or(cityOrFilter(c.cityMatchPatterns)),
    })
  }
  return tasks
}

async function computeHubCounts(db: SupabaseClient, signal?: AbortSignal): Promise<HubCount[]> {
  const tasks = buildTasks(db, signal)
  const results = await runCountTasksSettled(tasks.map((task) => task.run))

  const out: HubCount[] = []
  for (let i = 0; i < tasks.length; i++) {
    const n = results[i]?.count
    // PostgREST returns a numeric zero for a successful empty count and null
    // when the count is unavailable. Keep zero, skip only unknown values.
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
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
  options: { signal?: AbortSignal } = {},
): Promise<Map<string, number>> {
  let rows: HubCount[] = []
  try {
    rows = await getOrComputeCached(
      db,
      // Versioned for the direct-employer corpus. Reusing the aggregate-era
      // key would serve stale continuation counts for up to six hours.
      'hub-page-counts-direct-v2',
      21600,
      (signal) => computeHubCounts(db, signal),
      options,
    )
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
