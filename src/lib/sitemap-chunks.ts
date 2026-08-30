// Shared sitemap engine for /sitemap.xml and /sitemaps/*.xml. The index has one
// pages child and one jobs child. A fixed child list keeps robots.txt and route
// generation database-free. The jobs loader still uses UUID keyset pagination,
// so it can split again later without changing query semantics.

import { createClient } from '@supabase/supabase-js'
import { hourIso } from '@/lib/supabase'
import {
  MIN_INDEXABLE_DESCRIPTION_CHARS,
  escapeXml,
  isBuildPhase,
} from '@/lib/feed-builders'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { CAREER_PATHS } from '@/lib/career-paths'
import { HUB_JOB_LIMITS } from '@/lib/hub-job-queries'
import { hubPaginationUrls } from '@/lib/hub-pagination'
import { getHubPageCountsCached, hubCountKey, type HubKind } from '@/lib/hub-page-counts'
import { PUBLIC_EMPLOYER_JOB_SOURCE } from '@/lib/public-jobs'

export const SITEMAP_BASE = 'https://freejobpost.co'

// 6h, matching the old app/sitemap.ts and every other DB-backed feed on this
// site. Every sitemap route re-exports this so the whole family regenerates on
// one window and shares one underlying data fetch.
export const SITEMAP_REVALIDATE = 21600

export const SITEMAP_DATA_TIMEOUT_MS = 8000

// OpenNext's Durable Object ends an ISR self-fetch after 3,000ms (wrangler.jsonc).
// Workerd does not propagate that fetch cancellation to the route Request.signal,
// so the route needs its own earlier deadline or its PostgREST work can outlive
// the revalidation request. Keep enough margin for Next to handle the thrown ISR
// error before the outer Durable Object deadline.
export const SITEMAP_ISR_REQUEST_TIMEOUT_MS = 2000

// Direct-employer inventory is intentionally small enough for one child.
// Keeping the aggregate-era 20-way split produced mostly empty children and
// could preserve stale imported-job URLs in old ISR caches.
export const JOB_SITEMAP_CHUNKS = 1

export const PAGES_SITEMAP_CHILD = 'pages.xml'

const sitemapSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const sitemapSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!sitemapSupabaseUrl || !sitemapSupabaseAnonKey) {
  throw new Error('Missing Supabase environment variables for sitemap generation.')
}

// Keep the Supabase fetch TTL aligned with the child route's six-hour ISR TTL.
// The shared app client uses a one-hour floor, which would silently shorten the
// route's revalidation window. `no-store` is also wrong here because Next treats
// any route containing that fetch mode as dynamic and would disable ISR.
const sitemapSupabase = createClient(sitemapSupabaseUrl, sitemapSupabaseAnonKey, {
  auth: { persistSession: false },
  global: {
    fetch: (url, options = {}) =>
      fetch(url, { ...options, next: { revalidate: SITEMAP_REVALIDATE } } as RequestInit),
  },
})

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

export async function runSitemapLoaderWithDeadline<T>(
  label: string,
  load: (signal: AbortSignal) => Promise<T>,
  timeoutMs = SITEMAP_DATA_TIMEOUT_MS,
  requestSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`)
  let timedOut = false
  let requestAborted = requestSignal?.aborted ?? false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const abortFromRequest = () => {
    requestAborted = true
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    // Normalize an upstream TimeoutError to the standard AbortError signal that
    // postgrest-js recognizes as canceled and will not retry.
    controller.abort()
  }

  if (requestSignal) {
    if (requestSignal.aborted) abortFromRequest()
    else requestSignal.addEventListener('abort', abortFromRequest, { once: true })
  }

  if (!requestAborted) timeoutId = setTimeout(() => {
    timedOut = true
    // Keep the standard AbortError reason. postgrest-js suppresses retries only
    // for AbortError/ABORT_ERR, so aborting with timeoutError would retry GET and
    // HEAD requests on an already-aborted signal.
    controller.abort()
  }, timeoutMs)

  try {
    // Every production loader below passes this signal into its PostgREST
    // builder. Await the abort settlement so no request-bound I/O is detached
    // when the route finishes.
    const value = await load(controller.signal)
    if (timedOut) throw timeoutError
    if (requestAborted) {
      throw requestSignal?.reason ?? new DOMException('Request aborted', 'AbortError')
    }
    return value
  } catch (err) {
    if (timedOut) throw timeoutError
    if (requestAborted) {
      throw requestSignal?.reason ?? new DOMException('Request aborted', 'AbortError')
    }
    throw err
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    requestSignal?.removeEventListener('abort', abortFromRequest)
  }
}

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
  signal?: AbortSignal
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
  let query = sitemapSupabase
    .from('public_jobs')
    .select('id, slug, updated_at')
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
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

  const { data, error } = await (request.signal
    ? query.abortSignal(request.signal)
    : query)
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
  signal?: AbortSignal,
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
      signal,
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
    signal,
  })
  if (overflow.error) {
    throw new Error(`sitemaps/jobs-${chunk}.xml query failed: ${overflow.error.message}`)
  }
  if (overflow.rows.length === 0) return rows

  throw new Error(
    `sitemaps/jobs-${chunk}.xml reached the ${MAX_SITEMAP_URLS_PER_CHILD}-URL protocol limit`,
  )
}

type SitemapJobLoader = (
  chunk: number,
  requestSignal?: AbortSignal,
) => Promise<SitemapJobRow[]>

const loadSitemapJobChunkRows: SitemapJobLoader = (chunk, requestSignal) =>
  runSitemapLoaderWithDeadline(
    `sitemaps/jobs-${chunk}.xml data load`,
    (signal) => fetchSitemapJobChunkRows(chunk, fetchJobPageFromSupabase, signal),
    SITEMAP_DATA_TIMEOUT_MS,
    requestSignal,
  )

async function fetchLatestJobUpdatedAt(signal?: AbortSignal): Promise<string | null> {
  const query = sitemapSupabase
    .from('public_jobs')
    .select('updated_at')
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .gte('description_usable_chars', MIN_INDEXABLE_DESCRIPTION_CHARS)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)

  if (error) throw new Error(`pages sitemap latest-job query failed: ${error.message}`)
  const row = (data?.[0] ?? null) as { updated_at?: string } | null
  return typeof row?.updated_at === 'string' ? row.updated_at : null
}

async function fetchSitemapEmployers(signal?: AbortSignal): Promise<SitemapEmployerRow[]> {
  const jobQuery = sitemapSupabase
    .from('public_jobs')
    .select('employer_id')
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .not('employer_id', 'is', null)
  const { data: jobData, error: jobError } = await (
    signal ? jobQuery.abortSignal(signal) : jobQuery
  )
  if (jobError) throw new Error(`pages sitemap employer-job query failed: ${jobError.message}`)

  const employerIds = Array.from(
    new Set(
      ((jobData ?? []) as Array<{ employer_id: string | null }>)
        .map((row) => row.employer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  if (employerIds.length === 0) return []

  const query = sitemapSupabase
    .from('public_employers_directory')
    .select('slug, verified_via, company_name, verified_at')
    .in('id', employerIds)
    .not('verified_at', 'is', null)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)

  if (error) throw new Error(`pages sitemap employer query failed: ${error.message}`)
  return (data ?? []) as SitemapEmployerRow[]
}

export type PagesSitemapDependencies = {
  loadLatestJobUpdatedAt: (requestSignal?: AbortSignal) => Promise<string | null>
  loadEmployers: (requestSignal?: AbortSignal) => Promise<SitemapEmployerRow[]>
  loadHubCounts: (requestSignal?: AbortSignal) => Promise<Map<string, number>>
}

const defaultPagesSitemapDependencies: PagesSitemapDependencies = {
  loadLatestJobUpdatedAt: (requestSignal) =>
    runSitemapLoaderWithDeadline(
      'pages sitemap latest-job query',
      fetchLatestJobUpdatedAt,
      SITEMAP_DATA_TIMEOUT_MS,
      requestSignal,
    ),
  loadEmployers: (requestSignal) =>
    runSitemapLoaderWithDeadline(
      'pages sitemap employer query',
      fetchSitemapEmployers,
      SITEMAP_DATA_TIMEOUT_MS,
      requestSignal,
    ),
  loadHubCounts: (requestSignal) =>
    runSitemapLoaderWithDeadline(
      'pages sitemap hub counts',
      (signal) => getHubPageCountsCached(sitemapSupabase, { signal }),
      SITEMAP_DATA_TIMEOUT_MS,
      requestSignal,
    ),
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
 * Zero direct-employer jobs is a valid early-stage state. A successful empty
 * query returns the /jobs browse URL so the child stays valid and old aggregate
 * URLs are evicted. Query errors still throw at runtime to retain the last-good
 * ISR response; builds use the same safe /jobs fallback.
 */
export async function buildJobChunkSitemap(
  chunk: number,
  loadJobs: SitemapJobLoader = loadSitemapJobChunkRows,
  requestSignal?: AbortSignal,
): Promise<string> {
  let jobs: SitemapJobRow[]
  try {
    jobs = await loadJobs(chunk, requestSignal)
  } catch (err) {
    if (!isBuildPhase()) throw err
    console.error(`[sitemaps/jobs-${chunk}.xml] build-time query failed, using fallback:`, err)
    return renderUrlset([
      { url: `${SITEMAP_BASE}/jobs`, changeFrequency: 'hourly', priority: 0.9 },
    ])
  }

  if (jobs.length === 0) {
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

  if (entries.length === 0) {
    return renderUrlset([
      { url: `${SITEMAP_BASE}/jobs`, changeFrequency: 'hourly', priority: 0.9 },
    ])
  }
  return renderUrlset(entries)
}

/**
 * Everything that is not a /jobs/<slug> detail page: static routes, inventory
 * hubs, career-path guides, hub continuations, and the verified employer
 * directory.
 *
 * Kept whole rather than folded into the job chunks because it changes for
 * entirely different reasons (hub config and employer verification, not job ingest),
 * and because the hub roots are the DB-independent core we fall back to.
 */
export async function buildPagesSitemap(
  deps: PagesSitemapDependencies = defaultPagesSitemapDependencies,
  requestSignal?: AbortSignal,
): Promise<string> {
  const base = SITEMAP_BASE
  const [
    latestJobUpdatedAtResult,
    employersResult,
    hubCountsResult,
  ] = await Promise.allSettled([
    deps.loadLatestJobUpdatedAt(requestSignal),
    deps.loadEmployers(requestSignal),
    deps.loadHubCounts(requestSignal),
  ])
  const latestJobUpdatedAt = sitemapDatasetOrFallback(
    latestJobUpdatedAtResult,
    'latest-job timestamp',
    null,
  )
  const employers = sitemapDatasetOrFallback(employersResult, 'employer directory', [])
  // Continuation pages remain discoverable through their on-page pagination
  // links. Omitting only these URLs for one failed count cycle is intentional.
  const hubCounts = sitemapDatasetOrFallback(
    hubCountsResult,
    'hub page counts',
    new Map<string, number>(),
    { allowRuntimeFallback: true },
  )

  // Inventory routes all render slices of direct employer posts, so they share
  // the freshest job timestamp. Static routes (terms/privacy/post-job/
  // how-it-works) omit lastModified entirely — their content
  // rarely changes and emitting a moving timestamp is the lie pattern we avoid.
  const maxJobUpdate = latestJobUpdatedAt ?? undefined

  // /employer is intentionally excluded — it's auth-gated (redirects to
  // /employer/login when no session) and blocked by robots.txt. /employers
  // (plural) is the public employer directory, included below.
  const staticRoutes: SitemapUrl[] = [
    { url: `${base}/`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${base}/jobs`, lastModified: maxJobUpdate, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/specialty`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/state`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/city`, lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.85 },
    { url: `${base}/become`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/employers`, lastModified: maxJobUpdate, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/post-job`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Do not submit empty inventory hubs. When a count is unavailable, retain the
  // route for that cycle instead of treating an infrastructure failure as a
  // confirmed zero.
  const hasInventoryOrUnknown = (kind: HubKind, slug: string): boolean => {
    const count = hubCounts.get(hubCountKey(kind, slug))
    return count === undefined || count > 0
  }

  const specialtyRoutes: SitemapUrl[] = SPECIALTY_HUBS
    .filter((specialty) => hasInventoryOrUnknown('specialty', specialty.slug))
    .map((specialty) => ({
      url: `${base}/specialty/${specialty.slug}`,
      lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
    }))

  // NOTE (2026-06 audit, F65): the per-specialty + per-state RSS feed URLs were
  // REMOVED from the sitemap. XML feeds are not indexable web pages — 83 of them
  // in the sitemap just diluted crawl budget. Aggregators get the feed URLs
  // directly (/feeds page + partner outreach), not via sitemap.

  const stateRoutes: SitemapUrl[] = STATE_HUBS
    .filter((state) => hasInventoryOrUnknown('state', state.slug))
    .map((state) => ({
      url: `${base}/state/${state.slug}`,
      lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
    }))

  const cityRoutes: SitemapUrl[] = CITY_HUBS
    .filter((city) => hasInventoryOrUnknown('city', city.slug))
    .map((city) => ({
      url: `${base}/city/${city.slug}`,
      lastModified: maxJobUpdate, changeFrequency: 'daily', priority: 0.8,
    }))

  // Career-path guides — long-form factual content targeting the upstream
  // "how to become a <role>" query family.
  const careerPathRoutes: SitemapUrl[] = CAREER_PATHS.map((p) => ({
    url: `${base}/become/${p.slug}`,
    changeFrequency: 'monthly', priority: 0.7,
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
export async function buildChildSitemap(
  child: string,
  requestSignal?: AbortSignal,
): Promise<string | null> {
  const parsed = parseSitemapChild(child)
  if (parsed === null) return null
  return parsed.kind === 'pages'
    ? buildPagesSitemap(defaultPagesSitemapDependencies, requestSignal)
    : buildJobChunkSitemap(parsed.chunk, loadSitemapJobChunkRows, requestSignal)
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
