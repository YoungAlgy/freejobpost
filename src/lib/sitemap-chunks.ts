// Chunked sitemap builder — the shared engine behind /sitemap.xml (the index)
// and every /sitemaps/*.xml child.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 2026-08-19 INCIDENT FIX #2 — WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// /sitemap.xml used to be a single Next `app/sitemap.ts` emitting ONE <urlset>
// with every URL on the site. Two earlier fixes landed the same day and neither
// was enough on its own:
//
//   1. force-dynamic → `revalidate = 21600` (ccc122c). Removed the per-request
//      re-render. Not enough: the response was still 6.8MB.
//   2. `enableCacheInterception` in open-next.config.ts. Removed the 7-9ms
//      "enter the Next.js server" floor for cached routes. Not enough either,
//      for the reason measured below.
//
// This Worker is on the Workers FREE plan: 10ms CPU per HTTP request. For a
// cached `type: "route"` entry the interceptor's hot path (see
// @opennextjs/aws/dist/core/routing/cacheInterceptor.js) does THREE things whose
// cost scales linearly with body size, on every single request:
//
//     r2Object.json()              -> JSON.parse(entire cache object)
//     computeCacheControl()        -> md5 over the ENTIRE body (the ETag)
//     toReadableStream(body)       -> TextEncoder().encode(entire body)
//
// Measured locally (node 24, 25 reps, against the real .open-next cache file
// produced by a real `npm run cf:build`):
//
//   body size    cacheObj      JSON.parse   md5      encode    TOTAL
//   6.80 MB      7,343,682 B   10.33 ms     11.63 ms 10.39 ms  32.35 ms   ← old
//   355 KB         354,798 B    0.50 ms      0.61 ms  0.48 ms   1.59 ms   ← now
//   184 KB         184,280 B    0.32 ms      0.31 ms  0.25 ms   0.88 ms
//   ~3 KB            2,997 B    0.004 ms     0.006 ms 0.004 ms  0.014 ms
//
// 32ms of unavoidable per-request CPU against a 10ms budget is a 3.2x overrun,
// which is exactly what prod showed: `wrangler tail` caught /sitemap.xml
// returning 503 `exceededCpu`, killed at cpu=10ms, on 3 of 3 probes. The route
// was 100% down for Googlebot — not intermittent.
//
// NOTE the earlier note in open-next.config.ts blamed md5 alone (~12ms). That
// under-counted by ~3x: JSON.parse and the UTF-8 encode each cost about as much
// as the hash. The real number is ~32ms. Splitting the body is the only fix that
// touches all three at once, because all three are O(body).
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SHAPE
// ─────────────────────────────────────────────────────────────────────────────
//   /sitemap.xml                  DB-free <sitemapindex>, ~3KB, 21 children. The URL
//                                 already submitted to GSC + Bing keeps working
//                                 and keeps its name — it just changes schema.
//   /sitemaps/pages.xml           every non-job URL (static, specialty/state/
//                                 city hubs, career paths, federal agencies,
//                                 all 3 matrices, the /p/<n> hub continuations
//                                 added by the 2026-08-19 pagination fix, and
//                                 employers). ~1,400 URLs.
//   /sitemaps/jobs-0.xml          the /jobs/<slug> URLs, split into
//     … through jobs-19.xml       JOB_SITEMAP_CHUNKS stable UUID ranges.
//
// WHY A FIXED CHUNK COUNT: the child list has to be known to robots.ts and to
// the index route WITHOUT either of them touching the database. robots.ts is
// itself CPU-sensitive (it measured 7-9ms on prod pre-interception), so it must
// stay a pure in-memory string build. A fixed count makes SITEMAP_CHILDREN a
// compile-time constant that robots.ts, the index, and generateStaticParams all
// read from — so it is structurally impossible for robots.txt to advertise a
// sitemap that does not exist, or for a child to exist that nothing links to.
//
// WHY UUID RANGES, not offset slicing: public_jobs.id is a random UUID generated
// once when the row is created. Splitting the UUID keyspace into fixed,
// contiguous ranges pins every job to one child for life and lets PostgREST use
// the primary-key index to fetch ONLY that child. Offset slicing would shift
// jobs between children whenever an earlier row expired, while the previous
// FNV slug hash required every child to download the entire active corpus and
// discard 19/20 of it in JavaScript.
//
// WHY 20: see the table above. 20 chunks lands each child at ~355KB / ~1.59ms of
// size-scaled CPU — 16% of the 10ms budget, leaving ~8.4ms for the fixed
// interceptor + routing overhead we cannot measure off-platform. It also has
// room to grow: this corpus went 9.6K → 14.6K → 34K URLs in about three months,
// and even at 2x today's inventory a chunk is only ~710KB / ~3.2ms. 10 chunks
// (the original back-of-envelope guess) would be 722KB / 3.42ms TODAY and ~6.8ms
// at 2x — too close to the wall to ship. Google's own ceiling (50,000 URLs per
// sitemap) is nowhere near binding at ~1,700 URLs/chunk.

import { unstable_cache } from 'next/cache'
import { supabase, hourIso } from '@/lib/supabase'
import {
  MIN_INDEXABLE_DESCRIPTION_CHARS,
  escapeXml,
  isBuildPhase,
} from '@/lib/feed-builders'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { CAREER_PATHS } from '@/lib/career-paths'
import { computeViableCellsViaSql, type MatrixCell } from '@/lib/specialty-state-matrix'
import { getViableCityCellsCached, type CityMatrixCell } from '@/lib/city-specialty-matrix'
import { FEDERAL_AGENCIES } from '@/lib/federal-agencies'
import { getViableFederalCellsCached, type FederalMatrixCell } from '@/lib/federal-state-matrix'
import { HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import { hubPaginationUrls } from '@/lib/hub-pagination'
import { getHubPageCountsCached, hubCountKey, type HubKind } from '@/lib/hub-page-counts'

export const SITEMAP_BASE = 'https://freejobpost.co'

// 6h, matching the old app/sitemap.ts and every other DB-backed feed on this
// site. Every sitemap route re-exports this so the whole family regenerates on
// one window and shares one underlying data fetch.
export const SITEMAP_REVALIDATE = 21600

export const JOB_SITEMAP_CHUNKS = 20

export const PAGES_SITEMAP_CHILD = 'pages.xml'

/**
 * The complete, fixed child list. SINGLE SOURCE OF TRUTH — read by:
 *   - src/app/sitemap.xml/route.ts    (builds the <sitemapindex>)
 *   - src/app/sitemaps/[chunk]/route.ts (generateStaticParams + dispatch)
 *   - src/app/robots.ts               (Sitemap: lines)
 * Order matters only for readability; crawlers do not care.
 */
export const SITEMAP_CHILDREN: readonly string[] = [
  PAGES_SITEMAP_CHILD,
  ...Array.from({ length: JOB_SITEMAP_CHUNKS }, (_, i) => `jobs-${i}.xml`),
]

export function sitemapChildUrl(child: string): string {
  return `${SITEMAP_BASE}/sitemaps/${child}`
}

export type SitemapJobIdRange = {
  lowerInclusive: string | null
  upperExclusive: string | null
}

function uuidBoundary(firstByte: number): string {
  const prefix = firstByte.toString(16).padStart(2, '0')
  return `${prefix}000000-0000-0000-0000-000000000000`
}

/**
 * One stable, contiguous slice of the UUID keyspace.
 *
 * public_jobs.id is `uuid DEFAULT gen_random_uuid()`, so the first byte is
 * uniformly distributed and backed by the table's primary-key index. The
 * boundaries use ceil(i * 256 / chunks), giving every possible first byte to
 * exactly one child with bucket widths that differ by at most one byte value.
 */
export function sitemapJobIdRange(
  chunk: number,
  chunks: number = JOB_SITEMAP_CHUNKS,
): SitemapJobIdRange {
  if (!Number.isInteger(chunks) || chunks < 1 || chunks > 256) {
    throw new RangeError(`Invalid sitemap chunk count: ${chunks}`)
  }
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= chunks) {
    throw new RangeError(`Invalid sitemap chunk: ${chunk}`)
  }

  const lowerByte = Math.ceil((chunk * 256) / chunks)
  const upperByte = Math.ceil(((chunk + 1) * 256) / chunks)
  return {
    lowerInclusive: chunk === 0 ? null : uuidBoundary(lowerByte),
    upperExclusive: chunk === chunks - 1 ? null : uuidBoundary(upperByte),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML serialization
// ─────────────────────────────────────────────────────────────────────────────
// Byte-for-byte the same <urlset> shape Next's own metadata serializer emitted
// (next/dist/build/webpack/loaders/metadata/resolve-route-data.js resolveSitemap)
// so nothing about the output changes for Google except which file a URL lives
// in. One deliberate difference: <loc> is escaped. Next does NOT escape it, and
// a slug containing a bare `&` would have produced invalid XML and poisoned the
// whole sitemap. Slugs are generated safe today; escaping costs nothing and
// removes the landmine.

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export type SitemapUrl = {
  url: string
  lastModified?: string | Date
  changeFrequency?: ChangeFreq
  priority?: number
}

function isoDate(d: string | Date): string {
  return d instanceof Date ? d.toISOString() : d
}

export function renderUrlset(entries: readonly SitemapUrl[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const e of entries) {
    xml += '<url>\n'
    xml += `<loc>${escapeXml(e.url)}</loc>\n`
    if (e.lastModified) xml += `<lastmod>${isoDate(e.lastModified)}</lastmod>\n`
    if (e.changeFrequency) xml += `<changefreq>${e.changeFrequency}</changefreq>\n`
    if (typeof e.priority === 'number') xml += `<priority>${e.priority}</priority>\n`
    xml += '</url>\n'
  }
  xml += '</urlset>\n'
  return xml
}

export function renderSitemapIndex(
  entries: readonly { url: string; lastModified?: string | Date }[],
): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const e of entries) {
    xml += '<sitemap>\n'
    xml += `<loc>${escapeXml(e.url)}</loc>\n`
    if (e.lastModified) xml += `<lastmod>${isoDate(e.lastModified)}</lastmod>\n`
    xml += '</sitemap>\n'
  }
  xml += '</sitemapindex>\n'
  return xml
}

/** Every sitemap route returns through here so the headers can never drift. */
export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, s-maxage=${SITEMAP_REVALIDATE}, stale-while-revalidate=86400`,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────

export type SitemapJobRow = { id: string; slug: string; updated_at: string }
type SitemapEmployerRow = {
  slug: string
  verified_via: string | null
  company_name: string
  verified_at: string
}

const SITEMAP_JOB_PAGE_SIZE = 1000
const MAX_SITEMAP_URLS_PER_CHILD = 50000

export type SitemapJobPageRequest = SitemapJobIdRange & {
  afterId: string | null
  nowIso: string
  limit: number
}

export type SitemapJobPageResult = {
  rows: SitemapJobRow[]
  error: { message: string } | null
}

export type SitemapJobPageFetcher = (
  request: SitemapJobPageRequest,
) => Promise<SitemapJobPageResult>

async function fetchJobPageFromSupabase(
  request: SitemapJobPageRequest,
): Promise<SitemapJobPageResult> {
  let query = supabase
    .from('public_jobs')
    .select('id, slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', request.nowIso)
    .gte('description_usable_chars', MIN_INDEXABLE_DESCRIPTION_CHARS)
    .order('id', { ascending: true })
    .limit(request.limit)

  if (request.afterId) {
    query = query.gt('id', request.afterId)
  } else if (request.lowerInclusive) {
    query = query.gte('id', request.lowerInclusive)
  }
  if (request.upperExclusive) {
    query = query.lt('id', request.upperExclusive)
  }

  const { data, error } = await query
  return {
    rows: (data ?? []) as SitemapJobRow[],
    error: error ? { message: error.message } : null,
  }
}

/**
 * Fetch one child directly from its UUID range with keyset pagination.
 *
 * The old implementation put the full jobs and employers corpus inside one
 * module-level unstable_cache call. On the installed Next 16.3 and OpenNext
 * stack, a cache hit parsed that multi-megabyte object and a miss ran at least
 * 60 PostgREST range queries. Fetches nested inside unstable_cache are also
 * forced to no-store, so the claimed one-hour per-batch protection never
 * existed. One child now reads only its own indexed range and relies on the
 * route's six-hour ISR output cache.
 */
export async function fetchSitemapJobChunkRows(
  chunk: number,
  fetchPage: SitemapJobPageFetcher = fetchJobPageFromSupabase,
): Promise<SitemapJobRow[]> {
  const range = sitemapJobIdRange(chunk)
  const nowIso = hourIso()
  const rows: SitemapJobRow[] = []
  let afterId: string | null = null

  while (rows.length < MAX_SITEMAP_URLS_PER_CHILD) {
    const limit = Math.min(
      SITEMAP_JOB_PAGE_SIZE,
      MAX_SITEMAP_URLS_PER_CHILD - rows.length,
    )
    const result = await fetchPage({
      ...range,
      afterId,
      nowIso,
      limit,
    })
    if (result.error) {
      throw new Error(`sitemaps/jobs-${chunk}.xml query failed: ${result.error.message}`)
    }
    if (result.rows.length > limit) {
      throw new Error(`sitemaps/jobs-${chunk}.xml query exceeded its requested page size`)
    }

    rows.push(...result.rows)
    if (result.rows.length < limit) return rows

    const nextCursor = result.rows[result.rows.length - 1]?.id
    if (!nextCursor || nextCursor === afterId) {
      throw new Error(`sitemaps/jobs-${chunk}.xml query did not advance its UUID cursor`)
    }
    afterId = nextCursor
  }

  // Exactly 50,000 URLs is valid. Probe one row past the last cursor to tell
  // that case apart from a child that exceeds the sitemap protocol limit.
  const overflow = await fetchPage({
    ...range,
    afterId,
    nowIso,
    limit: 1,
  })
  if (overflow.error) {
    throw new Error(`sitemaps/jobs-${chunk}.xml query failed: ${overflow.error.message}`)
  }
  if (overflow.rows.length === 0) return rows

  throw new Error(
    `sitemaps/jobs-${chunk}.xml reached the ${MAX_SITEMAP_URLS_PER_CHILD}-URL protocol limit`,
  )
}

// The wrapper is intentionally one child at a time. Next 16.3 treats fetches
// inside unstable_cache as no-store, avoiding the separate stale fetch-cache
// layer while preserving static generation and route ISR. If the OpenNext
// fetch-cache write is dropped, the uncached fallback is still only one bounded
// UUID range instead of the old full-corpus scan.
const fetchCachedSitemapJobChunkRows = unstable_cache(
  (chunk: number) => fetchSitemapJobChunkRows(chunk),
  ['sitemap-job-child-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

async function fetchLatestJobUpdatedAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from('public_jobs')
    .select('updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .gte('description_usable_chars', MIN_INDEXABLE_DESCRIPTION_CHARS)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  if (error) throw new Error(`pages sitemap latest-job query failed: ${error.message}`)
  const row = (data?.[0] ?? null) as { updated_at?: string } | null
  return typeof row?.updated_at === 'string' ? row.updated_at : null
}

async function fetchSitemapEmployers(): Promise<SitemapEmployerRow[]> {
  const { data, error } = await supabase
    .from('public_employers_directory')
    .select('slug, verified_via, company_name, verified_at')
    .not('verified_at', 'is', null)

  if (error) throw new Error(`pages sitemap employer query failed: ${error.message}`)
  return (data ?? []) as SitemapEmployerRow[]
}

const fetchCachedLatestJobUpdatedAt = unstable_cache(
  fetchLatestJobUpdatedAt,
  ['sitemap-pages-latest-job-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

const fetchCachedSitemapEmployers = unstable_cache(
  fetchSitemapEmployers,
  ['sitemap-pages-employers-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

const fetchCachedFederalMatrixCells = unstable_cache(
  () => getViableFederalCellsCached(supabase),
  ['sitemap-pages-federal-matrix-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

const fetchCachedMatrixCells = unstable_cache(
  () => computeViableCellsViaSql(supabase),
  ['sitemap-pages-specialty-state-matrix-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

const fetchCachedCityMatrixCells = unstable_cache(
  () => getViableCityCellsCached(supabase),
  ['sitemap-pages-city-matrix-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

const fetchCachedHubCountEntries = unstable_cache(
  async () => [...(await getHubPageCountsCached(supabase)).entries()] as [string, number][],
  ['sitemap-pages-hub-counts-v2'],
  { revalidate: SITEMAP_REVALIDATE },
)

export type PagesSitemapDependencies = {
  loadLatestJobUpdatedAt: () => Promise<string | null>
  loadEmployers: () => Promise<SitemapEmployerRow[]>
  loadFederalMatrixCells: () => Promise<FederalMatrixCell[]>
  loadMatrixCells: () => Promise<MatrixCell[]>
  loadCityMatrixCells: () => Promise<CityMatrixCell[]>
  loadHubCounts: () => Promise<Map<string, number>>
}

const defaultPagesSitemapDependencies: PagesSitemapDependencies = {
  loadLatestJobUpdatedAt: fetchCachedLatestJobUpdatedAt,
  loadEmployers: fetchCachedSitemapEmployers,
  loadFederalMatrixCells: fetchCachedFederalMatrixCells,
  loadMatrixCells: fetchCachedMatrixCells,
  loadCityMatrixCells: fetchCachedCityMatrixCells,
  loadHubCounts: async () => new Map(await fetchCachedHubCountEntries()),
}

function sitemapDatasetOrFallback<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T,
  options: { allowRuntimeFallback?: boolean } = {},
): T {
  if (result.status === 'fulfilled') return result.value
  if (!isBuildPhase() && !options.allowRuntimeFallback) {
    throw result.reason
  }
  console.error(`[sitemap-pages] ${label} failed, omitting that data:`, result.reason)
  return fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One job chunk: every active, indexable /jobs/<slug> whose immutable job UUID
 * falls inside `chunk`'s fixed key range.
 *
 * FAIL SOFT, carefully. An EMPTY <urlset> is both schema-invalid (the sitemaps
 * 0.9 schema requires at least one <url>) and the worst thing to cache — it
 * tells Google a whole slice of the site vanished. We always have thousands of
 * active jobs, so 0 fetched means DB failure, never a real empty inventory.
 *   - At RUNTIME we throw, which makes ISR keep serving the last good child
 *     instead of overwriting it with emptiness.
 *   - At BUILD time a throw would abort the whole deploy with no cache to fall
 *     back to (the 2026-05-28 lesson from app/sitemap.ts), so we emit the single
 *     /jobs URL instead: valid, non-empty, already present in pages.xml, and
 *     harmless — the sitemaps protocol explicitly permits the same <loc> in more
 *     than one sitemap. It self-heals on the next healthy revalidate.
 */
export async function buildJobChunkSitemap(
  chunk: number,
  loadJobs: (chunk: number) => Promise<SitemapJobRow[]> = fetchCachedSitemapJobChunkRows,
): Promise<string> {
  let jobs: SitemapJobRow[]
  try {
    jobs = await loadJobs(chunk)
  } catch (err) {
    if (!isBuildPhase()) throw err
    console.error(`[sitemaps/jobs-${chunk}.xml] build-time query failed, using fallback:`, err)
    return renderUrlset([
      { url: `${SITEMAP_BASE}/jobs`, changeFrequency: 'hourly', priority: 0.9 },
    ])
  }

  if (jobs.length === 0) {
    if (!isBuildPhase()) {
      throw new Error(
        `sitemaps/jobs-${chunk}.xml: 0 jobs fetched — refusing to cache an empty ` +
        `sitemap. Serving last-good ISR cache instead.`,
      )
    }
    return renderUrlset([
      { url: `${SITEMAP_BASE}/jobs`, changeFrequency: 'hourly', priority: 0.9 },
    ])
  }

  const entries: SitemapUrl[] = []
  const seen = new Set<string>()
  for (const j of jobs) {
    if (!j.slug || seen.has(j.slug)) continue
    seen.add(j.slug)
    entries.push({
      url: `${SITEMAP_BASE}/jobs/${j.slug}`,
      lastModified: j.updated_at,
      changeFrequency: 'daily',
      priority: 0.7,
    })
  }
  return renderUrlset(entries)
}

/**
 * Everything that is not a /jobs/<slug> detail page: static routes, the
 * specialty/state/city hubs, career-path guides, federal agency pages, all three
 * viable-cell matrices, the /p/<n> hub continuations, and the verified employer
 * directory. ~1,400 URLs — still comfortably the cheapest child in the family
 * (the jobs-*.xml chunks are ~355KB / ~1.59ms and this stays well under them).
 *
 * Kept whole rather than folded into the job chunks because it changes for
 * entirely different reasons (hub config + matrix thresholds, not job ingest),
 * and because the hub roots are the DB-independent core we fall back to.
 */
export async function buildPagesSitemap(
  deps: PagesSitemapDependencies = defaultPagesSitemapDependencies,
): Promise<string> {
  const base = SITEMAP_BASE
  const [
    latestJobUpdatedAtResult,
    employersResult,
    federalMatrixCellsResult,
    matrixCellsResult,
    cityMatrixCellsResult,
    hubCountsResult,
  ] = await Promise.allSettled([
    deps.loadLatestJobUpdatedAt(),
    deps.loadEmployers(),
    deps.loadFederalMatrixCells(),
    deps.loadMatrixCells(),
    deps.loadCityMatrixCells(),
    deps.loadHubCounts(),
  ])
  const latestJobUpdatedAt = sitemapDatasetOrFallback(
    latestJobUpdatedAtResult,
    'latest-job timestamp',
    null,
  )
  const employers = sitemapDatasetOrFallback(employersResult, 'employer directory', [])
  const federalMatrixCells = sitemapDatasetOrFallback(
    federalMatrixCellsResult,
    'federal matrix',
    [],
  )
  const matrixCells = sitemapDatasetOrFallback(
    matrixCellsResult,
    'specialty-state matrix',
    [],
  )
  const cityMatrixCells = sitemapDatasetOrFallback(
    cityMatrixCellsResult,
    'city-specialty matrix',
    [],
  )
  // Continuation pages remain discoverable through their on-page pagination
  // links. Omitting only these URLs for one failed count cycle is intentional.
  const hubCounts = sitemapDatasetOrFallback(
    hubCountsResult,
    'hub page counts',
    new Map<string, number>(),
    { allowRuntimeFallback: true },
  )

  // Aggregator routes all render slices of the job inventory, so they share the
  // freshest job timestamp. Truly static routes (terms/privacy/post-job/pricing/
  // how-it-works/for-employers) omit lastModified entirely — their content
  // rarely changes and emitting a moving timestamp is the lie pattern we avoid.
  const maxJobUpdate = latestJobUpdatedAt ?? undefined

  // /employer is intentionally excluded — it's auth-gated (redirects to
  // /employer/login when no session) and blocked by robots.txt. /employers
  // (plural) is the public employer directory, included below.
  const staticRoutes: SitemapUrl[] = [
    { url: `${base}/`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/jobs`, lastModified: maxJobUpdate, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/jobs/federal`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/specialty`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/state`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/city`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/become`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/employers`, lastModified: maxJobUpdate, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/post-job`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/for-employers`, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${base}/changelog`, changeFrequency: 'weekly', priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    // Federal-compliance disclosure page. Low priority (regulatory, not
    // commercial) but must be crawler-discoverable for the E-Verify trust signal.
    { url: `${base}/e-verify`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Specialty hub pages — one per common healthcare specialty so each ranks for
  // "[specialty] jobs" queries. lastmod tied to job-data freshness.
  const specialtyRoutes: SitemapUrl[] = SPECIALTY_HUBS.map((s) => ({
    url: `${base}/specialty/${s.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
  }))

  // NOTE (2026-06 audit, F65): the per-specialty + per-state RSS feed URLs were
  // REMOVED from the sitemap. XML feeds are not indexable web pages — 83 of them
  // in the sitemap just diluted crawl budget. Aggregators get the feed URLs
  // directly (/feeds page + partner outreach), not via sitemap.

  // State hub pages — one per top US state for healthcare-job density.
  const stateRoutes: SitemapUrl[] = STATE_HUBS.map((s) => ({
    url: `${base}/state/${s.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
  }))

  // City hub pages — one per curated US healthcare metro. Closes the gap between
  // state hubs (broad) and per-job pages (narrow).
  const cityRoutes: SitemapUrl[] = CITY_HUBS.map((c) => ({
    url: `${base}/city/${c.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
  }))

  // Career-path guides — long-form factual content targeting the upstream
  // "how to become a <role>" query family.
  const careerPathRoutes: SitemapUrl[] = CAREER_PATHS.map((p) => ({
    url: `${base}/become/${p.slug}`,
    changeFrequency: 'monthly', priority: 0.7,
  }))

  // Federal-agency landing pages — one per FEDERAL_AGENCIES entry. The
  // /jobs/federal index is in staticRoutes above; this adds the per-agency leaves.
  const federalRoutes: SitemapUrl[] = FEDERAL_AGENCIES.map((a) => ({
    url: `${base}/jobs/federal/${a.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
  }))

  // The three viable-cell matrices. Each only emits cells with >= 5 active
  // matching jobs — the same threshold the routes' generateStaticParams
  // enforce, so the sitemap and the actually-renderable URLs stay in lockstep.
  const federalMatrixRoutes: SitemapUrl[] = federalMatrixCells.map((c) => ({
    url: `${base}/jobs/federal/${c.agency.slug}/${c.state.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.75,
  }))
  const matrixRoutes: SitemapUrl[] = matrixCells.map((c) => ({
    url: `${base}/specialty/${c.specialty.slug}/${c.state.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.75,
  }))
  // City x Specialty carries higher candidate intent than state x specialty
  // (city queries carry more explicit "where I want to work" signal).
  const cityMatrixRoutes: SitemapUrl[] = cityMatrixCells.map((c) => ({
    url: `${base}/city/${c.city.slug}/${c.specialty.slug}`,
    lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.75,
  }))

  // ─── Paginated hub continuations (/p/2 …) ──────────────────────────────────
  //
  // 2026-08-19: hub pages now cap how many jobs they render (see
  // src/lib/hub-pagination.ts — they were blowing the 10ms Workers CPU budget).
  // The overflow moved to real /p/<n> URLs, and those URLs carry job links that
  // exist nowhere else on the hub, so they belong in the sitemap.
  //
  // Two rules held here:
  //  1. NEVER advertise a page that does not exist. The count for each hub comes
  //     from a real query (getHubPageCountsCached), clamped by the family's
  //     `.limit()` because the route only ever paginates what it actually
  //     fetches. A hub with no counted value contributes nothing rather than a
  //     guessed page 2.
  //  2. Lower priority than page 1 (0.5 vs 0.8). Continuations should not
  //     compete with the hub page that is meant to rank.
  //
  // If the count scan is unavailable this whole block is simply empty for the
  // cycle; the continuations stay crawlable via the on-page pagination nav.
  const paginatedRoutes: SitemapUrl[] = []
  const addPaginated = (
    kind: HubKind,
    slug: string,
    basePath: string,
    familyLimit: number,
  ) => {
    const counted = hubCounts.get(hubCountKey(kind, slug))
    if (counted === undefined) return
    for (const url of hubPaginationUrls(basePath, Math.min(counted, familyLimit))) {
      paginatedRoutes.push({
        url: `${base}${url}`,
        lastModified: maxJobUpdate,
        changeFrequency: 'daily',
        priority: 0.5,
      })
    }
  }

  for (const s of STATE_HUBS) {
    addPaginated('state', s.slug, `/state/${s.slug}`, HUB_JOB_LIMITS.state)
  }
  for (const s of SPECIALTY_HUBS) {
    addPaginated('specialty', s.slug, `/specialty/${s.slug}`, HUB_JOB_LIMITS.specialty)
  }
  for (const c of CITY_HUBS) {
    addPaginated('city', c.slug, `/city/${c.slug}`, HUB_JOB_LIMITS.city)
  }
  for (const a of FEDERAL_AGENCIES) {
    addPaginated('federalAgency', a.slug, `/jobs/federal/${a.slug}`, HUB_JOB_LIMITS.federalAgency)
  }

  // The two matrix families get their counts for free from the viable-cell
  // scans already awaited above — no extra queries.
  for (const c of matrixCells) {
    for (const url of hubPaginationUrls(
      `/specialty/${c.specialty.slug}/${c.state.slug}`,
      Math.min(c.count, HUB_JOB_LIMITS.specialtyState),
    )) {
      paginatedRoutes.push({
        url: `${base}${url}`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.5,
      })
    }
  }
  for (const c of federalMatrixCells) {
    for (const url of hubPaginationUrls(
      `/jobs/federal/${c.agency.slug}/${c.state.slug}`,
      Math.min(c.count, HUB_JOB_LIMITS.federalAgencyState),
    )) {
      paginatedRoutes.push({
        url: `${base}${url}`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.5,
      })
    }
  }
  // /city/[slug]/[specialty] is deliberately absent: its `.limit(100)` already
  // equals HUB_PAGE_SIZE, so it has exactly one page and no continuations exist.

  const employerRoutes: SitemapUrl[] = employers
    .filter(
      (e) =>
        e.slug &&
        e.verified_via !== 'seeded' &&
        e.verified_via !== 'ats_import' &&
        !/^ava health partners\b/i.test(e.company_name)
    )
    .map((e) => ({
      url: `${base}/employers/${e.slug}`,
      lastModified: e.verified_at, changeFrequency: 'weekly', priority: 0.65,
    }))

  return renderUrlset([
    ...staticRoutes,
    ...specialtyRoutes,
    ...stateRoutes,
    ...cityRoutes,
    ...careerPathRoutes,
    ...federalRoutes,
    ...federalMatrixRoutes,
    ...matrixRoutes,
    ...cityMatrixRoutes,
    ...paginatedRoutes,
    ...employerRoutes,
  ])
}

export type SitemapChild =
  | { kind: 'pages' }
  | { kind: 'jobs'; chunk: number }

/**
 * Pure parser for a /sitemaps/<child> path segment. Split out from
 * buildChildSitemap so it can be unit-tested without a database — the property
 * that actually matters is that every name in SITEMAP_CHILDREN parses and every
 * name outside it does not, which is what keeps robots.txt, the index, and
 * generateStaticParams describing the same set of files.
 */
export function parseSitemapChild(child: string): SitemapChild | null {
  if (child === PAGES_SITEMAP_CHILD) return { kind: 'pages' }
  const m = /^jobs-(\d+)\.xml$/.exec(child)
  if (!m) return null
  const chunk = Number(m[1])
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= JOB_SITEMAP_CHUNKS) return null
  // Require the CANONICAL spelling. Without this round-trip check `jobs-01.xml`
  // parses as chunk 1, i.e. a second URL serving byte-identical content to
  // `jobs-1.xml` — duplicate content, and an unbounded family of them
  // (jobs-001.xml, jobs-0001.xml…). `dynamicParams = false` already 404s these
  // before the handler runs, since they aren't in generateStaticParams; this
  // makes the parser itself refuse to invent names the system never generates.
  if (`jobs-${chunk}.xml` !== child) return null
  return { kind: 'jobs', chunk }
}

/** Dispatch a /sitemaps/<child> path to the right builder. */
export async function buildChildSitemap(child: string): Promise<string | null> {
  const parsed = parseSitemapChild(child)
  if (parsed === null) return null
  return parsed.kind === 'pages'
    ? buildPagesSitemap()
    : buildJobChunkSitemap(parsed.chunk)
}

/**
 * The <sitemapindex> served at /sitemap.xml. ~3KB regardless of inventory.
 *
 * Deliberately database-independent. <lastmod> is optional in a sitemap index,
 * and every child already carries meaningful per-URL timestamps. The previous
 * implementation scanned the full active-job corpus only to compute optional
 * child timestamps. That scan flowed through _cachedSitemapData, whose payload
 * is known to exceed Next's 2MB cache-entry limit, so a cold index request could
 * reassemble the whole corpus and exceed the Worker's CPU budget before a
 * try/catch could run. /sitemap.xml is the discovery root for every child and
 * must remain a pure in-memory response.
 */
export async function buildSitemapIndex(): Promise<string> {
  return renderSitemapIndex(
    SITEMAP_CHILDREN.map((child) => ({
      url: sitemapChildUrl(child),
    })),
  )
}
