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
//   /sitemap.xml                  <sitemapindex>, ~3KB, 21 children. The URL
//                                 already submitted to GSC + Bing keeps working
//                                 and keeps its name — it just changes schema.
//   /sitemaps/pages.xml           every non-job URL (static, specialty/state/
//                                 city hubs, career paths, federal agencies,
//                                 all 3 matrices, the /p/<n> hub continuations
//                                 added by the 2026-08-19 pagination fix, and
//                                 employers). ~1,400 URLs.
//   /sitemaps/jobs-0.xml          the ~33,000 /jobs/<slug> URLs, split into
//     … through jobs-19.xml       JOB_SITEMAP_CHUNKS fixed buckets by slug hash.
//
// WHY A FIXED CHUNK COUNT: the child list has to be known to robots.ts and to
// the index route WITHOUT either of them touching the database. robots.ts is
// itself CPU-sensitive (it measured 7-9ms on prod pre-interception), so it must
// stay a pure in-memory string build. A fixed count makes SITEMAP_CHILDREN a
// compile-time constant that robots.ts, the index, and generateStaticParams all
// read from — so it is structurally impossible for robots.txt to advertise a
// sitemap that does not exist, or for a child to exist that nothing links to.
//
// WHY HASH BUCKETING, not offset slicing: the job query is ordered
// `updated_at DESC`, so with offset slicing every re-sync shifts jobs between
// chunks and all 20 children churn completely on every regeneration. Hashing the
// slug pins a job to one bucket for its entire life, so a child sitemap's
// content (and its <lastmod> in the index) is stable and actually means
// something to a crawler.
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
import { activeJobBatchCount, runBatchesConcurrencyCapped } from '@/lib/active-batch-count'
import {
  MIN_INDEXABLE_DESCRIPTION_CHARS,
  escapeXml,
  isBuildPhase,
} from '@/lib/feed-builders'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'
import { CAREER_PATHS } from '@/lib/career-paths'
import { computeViableCellsViaSql } from '@/lib/specialty-state-matrix'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'
import { FEDERAL_AGENCIES } from '@/lib/federal-agencies'
import { getViableFederalCellsCached } from '@/lib/federal-state-matrix'
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

/**
 * FNV-1a 32-bit. Picked because it is dependency-free, identical in Node and in
 * workerd, and stable forever — a job must not migrate between child sitemaps
 * just because the runtime changed. Math.imul keeps the multiply in int32 so the
 * result cannot drift into float territory on long slugs.
 */
export function sitemapChunkForSlug(slug: string, chunks: number = JOB_SITEMAP_CHUNKS): number {
  let h = 0x811c9dc5
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % chunks
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

type SitemapJobRow = { slug: string; updated_at: string }
type SitemapEmployerRow = {
  slug: string
  verified_via: string | null
  company_name: string
  verified_at: string
}

// Pull job inventory + employer directory for the sitemap family. We use the
// first job row's updated_at as the lastmod signal for every route that
// aggregates the job table (homepage, /jobs, hub indexes, individual
// state/specialty hubs).
//
// Jobs: batched .range() pattern (PostgREST anon caps a single .limit(>1000)
// at 1,000 silently; with ~9,616 active jobs we'd ship a sitemap covering
// only 11% of inventory without batching). Verified 2026-05-19 — pre-fix
// sitemap had been missing ~8,000 URLs from Google's index for weeks.
// Bumped 9 → 12 on 2026-05-21 to match /jobs.xml + feed-builders, then 12 → 30
// on 2026-05-28 (the 12K ceiling silently dropped ~2.6K oldest jobs at 14.6K
// active inventory — same deindex failure mode, re-armed by growth). The count
// is now derived from a real COUNT of the active corpus (active-batch-count.ts)
// so it tracks inventory growth on its own and cannot be out-grown again.
//
// 🔴 2026-07-23 INCIDENT FIX (same root cause as city-specialty-matrix.ts's
// 2026-06 incident, see its comment): the route was force-dynamic, which
// disables the Data Cache for every fetch inside it — so these 30+ parallel
// range() batches + the employer scan were firing on EVERY crawl hit, uncached.
// Fine against the old Micro-compute Postgres; it started 504ing outright once
// the DB moved to Nano compute (shared CPU), and appears to have also starved
// the homepage sharing the same pool. Wrapped in Next's data cache: ≤ one full
// scan per 6h globally, regardless of crawl frequency.
async function _fetchSitemapDataUncached(): Promise<{
  jobs: SitemapJobRow[]
  employers: SitemapEmployerRow[]
}> {
  const numBatches = await activeJobBatchCount(supabase)
  const SITEMAP_BATCH_SIZE = 1000
  // hourIso (not a raw new Date()) keeps the PostgREST URL stable within the
  // hour so these batch fetches actually hit the Next Data Cache (F52).
  const nowIso = hourIso()
  // description_usable_chars >= MIN_INDEXABLE_DESCRIPTION_CHARS (250) mirrors the
  // /jobs/[slug] noindex gate exactly — a sitemap must not submit URLs that
  // declare noindex (F62: 11.5K thin jobs were being submitted). Uses the SHARED
  // constant, not a literal 250, so this floor and the page gate can't drift
  // (they did on 2026-06-15 when the feed bar moved to 600 and dragged the page
  // gate with it while this literal stayed 250). Generated column + partial
  // index added 2026-06 (migration add_description_usable_chars_to_public_jobs).
  const baseJobs = () => supabase
    .from('public_jobs')
    .select('slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', nowIso)
    .gte('description_usable_chars', MIN_INDEXABLE_DESCRIPTION_CHARS)
    .order('updated_at', { ascending: false }).order('id', { ascending: false })
  // 2026-08-12 — this fired all `numBatches` (up to 30+) job-range queries
  // PLUS the employer query in a single Promise.all, an uncapped burst on
  // every 6h cache-cold hit (worse: it can stack with city-specialty-
  // matrix.ts's own uncapped burst if both caches are cold at once — see
  // active-batch-count.ts's note). Job batches now route through the shared
  // runBatchesConcurrencyCapped helper; the employer query still runs
  // alongside the first chunk since it's one lightweight query, not a burst.
  const [employersRes, jobsBatches] = await Promise.all([
    // Employer pages — only verified non-seeded employers with at least 1 active job
    // (the page itself enforces the job-count gate, but pre-filtering here keeps
    // the sitemap clean and avoids surfacing empty 404-bound pages to crawlers)
    supabase
      .from('public_employers_directory')
      .select('slug, verified_via, company_name, verified_at')
      .not('verified_at', 'is', null),
    runBatchesConcurrencyCapped(numBatches, (i) =>
      baseJobs().range(i * SITEMAP_BATCH_SIZE, (i + 1) * SITEMAP_BATCH_SIZE - 1)
    ),
  ])

  const jobs = jobsBatches.flatMap(
    (b) => (b.data ?? []) as SitemapJobRow[]
  )
  const employers = (employersRes.data ?? []) as SitemapEmployerRow[]
  return { jobs, employers }
}

// ⚠️ KNOWN LIMITATION, documented rather than worked around (2026-08-19): Next's
// fetch cache refuses any single entry over 2MB
// (next/dist/server/lib/incremental-cache/index.js: "items over 2MB can not be
// cached"). At 34K jobs this payload serializes to ~3.5MB, so THIS wrapper's
// write is dropped with a build-time warning and every consumer re-runs
// _fetchSitemapDataUncached.
//
// That is survivable, and it is why the wrapper is kept rather than deleted: the
// layer that actually protects Postgres is one level down. Every PostgREST batch
// request goes through the shared `supabase` client, which sets
// `next: { revalidate: 3600 }` on its fetch, and hourIso() keeps each batch URL
// byte-stable within the hour. Each batch response is ~150KB — comfortably under
// 2MB — so the 21 sitemap routes prerendered in one build share ONE set of
// cached batch responses and the database sees a single scan. What repeats per
// route is the JS reassembly (a flatMap + a filter over ~34K tiny rows, tens of
// milliseconds), not the query.
//
// If this payload ever needs to genuinely cache as one unit, the established
// pattern in this repo is src/lib/db-cache.ts (Postgres-backed
// getOrComputeCached), which was introduced on 2026-08-13 for exactly this class
// of problem after Next's Data Cache was found not to persist at all on this
// OpenNext/Cloudflare deploy for the matrix helpers.
const _cachedSitemapData = unstable_cache(
  _fetchSitemapDataUncached,
  ['sitemap-jobs-and-employers-v1'],
  { revalidate: SITEMAP_REVALIDATE },
)

/**
 * De-duped job list. The batched .range() queries run concurrently and are
 * ordered by updated_at DESC. If a job's updated_at shifts mid-generation (e.g.
 * a concurrent ATS re-sync bumps it) it can land inside two overlapping batch
 * windows and appear twice. Rare (3 of 23,460 URLs, 2026-07-01 audit) but cheap
 * to close outright rather than resize the batching around a race that's
 * inherent to offset pagination over a table that's still being written to.
 */
function dedupeJobs(jobs: readonly SitemapJobRow[]): SitemapJobRow[] {
  const seen = new Set<string>()
  const out: SitemapJobRow[] = []
  for (const j of jobs) {
    if (!j.slug || seen.has(j.slug)) continue
    seen.add(j.slug)
    out.push(j)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One job chunk: every active, indexable /jobs/<slug> whose slug hashes to
 * `chunk`.
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
export async function buildJobChunkSitemap(chunk: number): Promise<string> {
  const { jobs } = await _cachedSitemapData()

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
    if (sitemapChunkForSlug(j.slug) !== chunk) continue
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
export async function buildPagesSitemap(): Promise<string> {
  const base = SITEMAP_BASE
  const { jobs, employers } = await _cachedSitemapData()

  // Aggregator routes all render slices of the job inventory, so they share the
  // freshest job timestamp. Truly static routes (terms/privacy/post-job/pricing/
  // how-it-works/for-employers) omit lastModified entirely — their content
  // rarely changes and emitting a moving timestamp is the lie pattern we avoid.
  const maxJobUpdate = jobs[0]?.updated_at ? new Date(jobs[0].updated_at) : new Date()

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
  const [federalMatrixCells, matrixCells, cityMatrixCells] = await Promise.all([
    getViableFederalCellsCached(supabase),
    computeViableCellsViaSql(supabase),
    getViableCityCellsCached(supabase),
  ])

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
  const hubCounts = await getHubPageCountsCached(supabase)
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
 * Per-child <lastmod> is worth the extra pass: it lets Googlebot skip children
 * that have not changed, which is the entire point of splitting. Job chunks get
 * the max updated_at of the jobs actually IN that chunk — which is meaningful
 * precisely because hash bucketing pins a job to one chunk for life.
 *
 * FAIL SOFT: <lastmod> is optional in the sitemapindex schema, so if the job
 * fetch comes back empty we still emit a complete, valid index listing all 21
 * children — just without timestamps. /sitemap.xml is the single most important
 * URL on the site; it must never fail or shrink because the DB hiccuped.
 */
export async function buildSitemapIndex(): Promise<string> {
  let lastmods: (string | undefined)[] = SITEMAP_CHILDREN.map(() => undefined)
  try {
    const { jobs } = await _cachedSitemapData()
    if (jobs.length > 0) {
      const deduped = dedupeJobs(jobs)
      const newest = deduped[0]?.updated_at
      const perChunk = new Array<string | undefined>(JOB_SITEMAP_CHUNKS)
      for (const j of deduped) {
        const c = sitemapChunkForSlug(j.slug)
        const cur = perChunk[c]
        if (cur === undefined || j.updated_at > cur) perChunk[c] = j.updated_at
      }
      lastmods = SITEMAP_CHILDREN.map((child) => {
        if (child === PAGES_SITEMAP_CHILD) return newest
        const m = /^jobs-(\d+)\.xml$/.exec(child)
        return m ? perChunk[Number(m[1])] : undefined
      })
    }
  } catch (err) {
    // Never let a data problem take down the index itself.
    console.error('[sitemap-index] lastmod computation failed, emitting index without timestamps:', err)
  }

  return renderSitemapIndex(
    SITEMAP_CHILDREN.map((child, i) => ({
      url: sitemapChildUrl(child),
      lastModified: lastmods[i],
    })),
  )
}
