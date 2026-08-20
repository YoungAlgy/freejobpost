import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  // 2026-08-19 — wrap the DO revalidation queue in the regional Cache API
  // deduper. Without it, EVERY request for a page that is stale re-sends the
  // same revalidation message to the Durable Object. When revalidation is
  // failing (which it was — see the DO row-read incident below) the page never
  // stops being stale, so a single popular stale URL turns into a sustained
  // stream of DO calls from every colo that sees traffic. The dedup key is
  // MessageGroupId + MessageDeduplicationId, and MessageDeduplicationId is
  // md5(path-lastModified-etag), which is CONSTANT for as long as the page
  // stays stale — so the wrapper collapses that whole storm into one DO call
  // per colo per TTL. 120s (vs the 5s default) because every ISR window on
  // this site is >= 1h, so a worst-case 2-minute delay to a background
  // revalidation is invisible, while the damping effect is large.
  queue: queueCache(doQueue, { regionalCacheTtlSec: 120 }),
  tagCache: d1NextTagCache,
  // 2026-08-19 — THE fix for the `exceededCpu` failures. This Worker is on the
  // Workers FREE plan, which allows 10ms of CPU per HTTP request (paid is 30s).
  // Cloudflare lets an isolate burst over that occasionally, but terminates you
  // once you hit it consistently — which is exactly what was happening: ~13% of
  // all invocations over 48h died with `exceededResources`/`exceededCpu`.
  //
  // The clearest evidence from `wrangler tail` on prod is /robots.txt. That
  // handler returns a hardcoded object and touches nothing — no DB, no cache —
  // and it still burned 7ms, 9ms and 9ms CPU on three consecutive probes. That
  // is the fixed per-request overhead of booting/entering the Next.js server,
  // and it eats 70-90% of the entire 10ms budget before any route does a single
  // useful thing. Everything else follows from that floor: an ISR cache HIT
  // cost 6-19ms (/ = 3-6ms, /jobs = 9ms, /specialty/registered-nurse = 19ms)
  // and a real render cost 60-607ms.
  //
  // Cache interception answers any route in the prerender manifest straight out
  // of the R2 incremental cache and never enters the Next server, which is what
  // removes that floor. Anything it can't serve falls through to the normal
  // handler untouched (see the `if (isISR)` guard in @opennextjs/aws
  // cacheInterceptor.js), and it deliberately passes through for
  // `x-prerender-revalidate`, so background ISR regeneration still renders for
  // real. It's flagged `dangerous` upstream mainly because it bypasses
  // middleware — this app has no middleware.ts at all, so that caveat does not
  // apply here.
  //
  // CAVEAT, because it is not free for everything: the interceptor's cost scales
  // LINEARLY WITH BODY SIZE in three separate places, not one —
  //   r2Object.json()        JSON.parse of the entire cache object
  //   computeCacheControl()  md5 over the entire body, for the ETag
  //   toReadableStream()     TextEncoder().encode of the entire body
  // An earlier version of this note blamed md5 alone (~12ms on the old 6.8MB
  // sitemap) and under-counted by ~3x: measured against real .open-next cache
  // files, parse/md5/encode each cost about the same, and the true figure for
  // that 6.8MB body was ~32ms against a 10ms budget.
  //
  // So interception is a clear win for small routes and does NOT rescue heavy
  // ones. /sitemap.xml was the worst offender and has been SPLIT — it is now a
  // 3KB <sitemapindex> plus 21 children of ~200-350KB, worst child measuring
  // 1.94ms (19% of budget). See src/lib/sitemap-chunks.ts for the full writeup.
  //
  // ✅ RESOLVED 2026-08-19 (fix #3), same root cause, different routes: the
  // heaviest HTML hub pages had become the largest cache entries on the site. A
  // full sweep of the built cache — every entry, not just the known-bad three —
  // found 93 of 477 at >= 35% of budget, and the worst was already OVER it:
  //
  //   route                          BEFORE               AFTER
  //   /jobs/federal/va               2.68MB  10.06ms 101%  497KB  2.13ms  21%
  //   /state/new-mexico              1.40MB   7.29ms  73%  519KB  2.41ms  24%
  //   /specialty/respiratory-therapy 1.40MB   7.16ms  72%  514KB  1.93ms  19%
  //   /state/north-carolina          1.48MB   5.94ms  59%  565KB  1.95ms  20%
  //   /jobs/federal/va/texas         1.20MB   5.86ms  59%  425KB  2.25ms  22%
  //   worst entry on the site       10.06ms (101%)        3.32ms (33%)
  //   entries >= 60% of budget      10                    0
  //   entries >= 35% of budget      93                    0
  //
  // /jobs/federal/va was not "close to the wall", it was measured at 101% before
  // any interceptor or routing overhead. It was already failing.
  //
  // WHAT WAS ACTUALLY BIG — measured, not assumed. Not the chrome and not the
  // JSON-LD (all three ld+json blocks are 0.8% of the HTML; the ItemList was
  // already capped at 30). It was the job list, amplified ~5x by how Next stores
  // an App Router page: the HTML holds the job rows once as markup and again in
  // the inline RSC flight payload (34% + 62% of the HTML), `rsc` holds them a
  // third time, and `segmentData` holds a BYTE-IDENTICAL copy of `rsc` under
  // "/_full" plus a fourth near-copy under "…/__PAGE__". JSON.parse pays for all
  // of it on every request; only `html` is ever served.
  //
  // The fix caps each hub at HUB_PAGE_SIZE rendered jobs and moves the rest to
  // real crawlable /p/<n> URLs. See src/lib/hub-pagination.ts for the full
  // writeup, the page-size reasoning, and the SEO argument. Per-request CPU for
  // these routes is now O(1) in corpus size instead of growing with inventory
  // forever, which is the part that actually retires this class of incident.
  //
  // ⚠️ NEXT LEVER IF THIS EVER GETS TIGHT AGAIN: `segmentData` is still ~40% of
  // every cache entry sitewide and is dead weight for HTML requests — the
  // interceptor only reads it when a request carries `next-router-segment-prefetch`,
  // which no crawler and no cold page load ever sends. Dropping it at cache-write
  // time (a thin wrapper over r2IncrementalCache) would cut ~40% off EVERY route,
  // not just hubs, and the interceptor already falls back to `cachedValue.rsc`
  // when a segment key is absent. Not done here: it changes client-nav prefetch
  // behavior for the whole app and deserves its own change and its own testing.
  enableCacheInterception: true,
});
