// Shared pagination primitives for the job-list hub pages.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 2026-08-19 INCIDENT FIX #3 — WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// Same root cause as the /sitemap.xml split (see src/lib/sitemap-chunks.ts for
// the full cost model and the measurement method): this Worker is on the
// Cloudflare Workers FREE plan, 10ms CPU per HTTP request, and
// `enableCacheInterception` makes every cached page pay three costs that scale
// linearly with the size of its cache entry, on EVERY request —
//
//     r2Object.json()          JSON.parse of the ENTIRE cache object
//     computeCacheControl()    md5 over the served body (the ETag)
//     toReadableStream(body)   TextEncoder().encode of the served body
//
// The hub pages rendered their whole matching job corpus inline. Measured
// against the real .open-next cache files from `npm run cf:build`:
//
//   route                          jobs   cache file   CPU      % of 10ms
//   /jobs/federal/va                503      2.68 MB   10.06ms   101%  ← DEAD
//   /state/new-mexico               300      1.40 MB    7.29ms    73%
//   /specialty/respiratory-therapy  300      1.40 MB    7.16ms    72%
//   … 93 entries total at >= 35% of budget across 7 hub route families.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT ACTUALLY MADE THEM BIG — measured, not assumed
// ─────────────────────────────────────────────────────────────────────────────
// It was NOT repeated chrome and NOT the JSON-LD (all three ld+json blocks on
// /jobs/federal/va total 7,473 chars = 0.8% of the HTML; the ItemList is
// already capped at 30 entries). It was the job list, but amplified ~5x by how
// Next stores an App Router page in the incremental cache. For
// /jobs/federal/va's 2.68MB entry:
//
//   html          914 KB   job <li> markup 320KB (34%) + the inline RSC flight
//                          payload <script>self.__next_f.push(...)</script>
//                          583KB (62%), which is the SAME job data again for
//                          hydration. ~96% of the HTML is the job list twice.
//   rsc           509 KB   the job data a 3rd time
//   segmentData 1,136 KB   "/_full" is a BYTE-IDENTICAL copy of `rsc` (verified
//                          rsc === segmentData["/_full"]), plus
//                          "…/__PAGE__" which is a 4th near-copy.
//
// So one rendered job costs ~3,300 B (state hubs) to ~5,000 B (federal hubs, the
// USAJobs titles are long) of CACHE FILE, against ~636 B of visible markup. And
// JSON.parse pays for all of it — html + rsc + segmentData — even though a
// normal HTML request serves only `html`. segmentData is consulted solely when a
// request carries the `next-router-segment-prefetch` header, which Googlebot and
// every cold page load never send. That is pure parse tax on every request.
//
// Fitting the measured entries: cache_bytes ≈ FIXED_CHROME + PER_JOB × N, with
// FIXED_CHROME ≈ 350 KB (state), ≈ 236 KB (specialty), and the fit is tight
// (predicted 1,548 KB vs actual 1,552 KB for /state/north-carolina at 300 jobs).
// Capping N is therefore the whole fix, and it converts a cost that grew
// linearly with inventory FOREVER into a constant.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY 50 PER PAGE
// ─────────────────────────────────────────────────────────────────────────────
// Measured, not guessed. A full `npm run cf:build` at 100/page put the worst
// entry (/state/south-dakota) at 740KB / 4.33ms — 43% of budget, down from
// /jobs/federal/va's 101%. That is a real fix, but 43% is roughly 2x the ~19%
// the sitemap split deliberately left itself, and the reason that margin exists
// is written down in sitemap-chunks.ts: these numbers are measured off-platform,
// and there is fixed interceptor + routing CPU on real workerd hardware that
// cannot be measured from here. Prod once showed /specialty/registered-nurse at
// 19ms on a cache HIT where this harness measured 4.70ms — that reading predates
// cache interception so it is not a clean ratio, but it is the only evidence
// available about CF-vs-local CPU and it does not point the reassuring way.
// This is the SECOND CPU incident on this Worker. The cost of over-correcting is
// some R2 objects; the cost of under-correcting is 503s on the highest-value SEO
// pages on the site, which is the failure that already happened twice.
//
// 50/page halves the variable term and lands the worst page near ~3.3ms (~33%).
//
// Going lower buys almost nothing, and that is the important structural point:
// the residual cost is now the page-1 CHROME, not the job list. A state hub
// carries ~385KB of fixed weight (FAQ, salary table, licensing aside, 52 state
// peer links, 38 specialty links, breadcrumbs, head) before it renders a single
// job, and that ~385KB floor is ~2.25ms on its own. 50 jobs adds ~178KB; 25
// would add ~89KB and only reach ~2.8ms. The job list has stopped being the
// dominant term, so the next real lever is the chrome and the segmentData
// duplication described above — not a smaller page.
//
// Critically, ANY fixed cap makes per-request CPU O(1) in corpus size, which is
// the property that actually retires this incident. The previous design re-armed
// itself every single time inventory grew.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY PAGE 1 KEEPS THE BARE URL, AND WHY AGGREGATES ARE NOT SLICED
// ─────────────────────────────────────────────────────────────────────────────
// /state/florida stays /state/florida (page 1) and continuations live at
// /state/florida/p/2. The already-indexed URL never moves, so no redirect and no
// re-earning of authority.
//
// The hub pages compute salary tables, city linkbars, specialty distributions
// and headline counts from the job array. Those are deliberately still computed
// over the FULL fetched set — only the rendered <li> list is sliced. Slicing the
// aggregates too would make the salary table and the "(300)" in the <h1> change
// depending on which page you were on, which is both wrong and a thin-content
// signal. The DB query is unchanged; this is purely a render-side cap.
//
// SEO REACHABILITY: no job becomes unreachable. Each hub still exposes exactly
// the same jobs it did before, just spread across N crawlable URLs linked by
// real <a href> pagination (never a client-side "load more"), every page
// self-canonical, and the continuation URLs are emitted into pages.xml by
// src/lib/sitemap-chunks.ts. All ~33K /jobs/<slug> URLs also remain listed in
// the jobs-*.xml children independently of any hub page.

/**
 * Rendered job cards per hub page. See the "WHY 50" note above before changing
 * this — it trades CPU against R2 storage and crawl budget, and all three were
 * measured against a real `npm run cf:build`, not guessed.
 */
export const HUB_PAGE_SIZE = 50

/**
 * How many pages a hub of `totalItems` jobs splits into. Always >= 1 so that an
 * empty hub still has a valid page 1 to serve (the empty state is real content —
 * "no active roles right now" — not a 404).
 */
export function hubTotalPages(totalItems: number, size: number = HUB_PAGE_SIZE): number {
  if (!Number.isFinite(totalItems) || totalItems <= 0) return 1
  if (!Number.isFinite(size) || size <= 0) return 1
  return Math.max(1, Math.ceil(totalItems / size))
}

/**
 * Parse the `[page]` segment of a /p/<n> continuation route.
 *
 * Requires the CANONICAL spelling and refuses page 1, for the same reason
 * parseSitemapChild() refuses `jobs-01.xml`: without it, `/state/florida/p/1`,
 * `/p/01` and `/p/001` would all serve byte-identical content to
 * `/state/florida`, which is an unbounded family of duplicate URLs pointing at
 * the site's most valuable pages. Page 1 has exactly one address — the bare hub
 * URL — and everything else here 404s.
 */
export function parseHubPageParam(raw: string): number | null {
  // ^[1-9]\d*$ rejects "", "0", "01", "-2", "2.0", "abc" and any leading zero.
  if (!/^[1-9]\d*$/.test(raw)) return null
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) return null
  // Page 1 is the bare hub URL, never /p/1.
  if (n < 2) return null
  return n
}

/**
 * URL for page `page` of the hub rooted at `basePath` (no trailing slash).
 * Page 1 is the bare hub path so the canonical URL never gains a suffix.
 */
export function hubPageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}/p/${page}`
}

/** The slice of `items` shown on page `page`. 1-indexed. */
export function sliceHubPage<T>(
  items: readonly T[],
  page: number,
  size: number = HUB_PAGE_SIZE,
): T[] {
  const p = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
  const s = Number.isFinite(size) && size > 0 ? Math.floor(size) : HUB_PAGE_SIZE
  return items.slice((p - 1) * s, p * s)
}

/**
 * generateStaticParams() payload for a /p/[page] route: pages 2..N, since page 1
 * is served by the parent route. Empty when everything fits on one page, which
 * correctly prerenders nothing.
 */
export function hubPageStaticParams(
  totalItems: number,
  size: number = HUB_PAGE_SIZE,
): { page: string }[] {
  const pages = hubTotalPages(totalItems, size)
  const out: { page: string }[] = []
  for (let p = 2; p <= pages; p++) out.push({ page: String(p) })
  return out
}

/**
 * Every continuation URL for one hub, for the sitemap. Returns [] when the hub
 * fits on a single page — a hub with no page 2 must not advertise one.
 */
export function hubPaginationUrls(
  basePath: string,
  totalItems: number,
  size: number = HUB_PAGE_SIZE,
): string[] {
  const pages = hubTotalPages(totalItems, size)
  const out: string[] = []
  for (let p = 2; p <= pages; p++) out.push(hubPageHref(basePath, p))
  return out
}

/**
 * " | page N of M" suffix for <title> and meta description on continuation
 * pages. Empty on page 1 so the primary hub title is untouched — that title is
 * what ranks and it must not change.
 */
export function hubPageTitleSuffix(page: number, totalPages: number): string {
  if (page <= 1) return ''
  return ` | page ${page} of ${totalPages}`
}
