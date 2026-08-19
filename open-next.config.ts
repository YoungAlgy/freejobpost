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
  // ⚠️ STILL OUTSTANDING, same root cause, different routes: the heaviest HTML
  // hub pages are now the largest cache entries on the site and are measured, not
  // estimated —
  //   /jobs/federal/va               2.68MB  ~8.9ms   89% of budget
  //   /state/north-carolina          1.48MB  ~5.5ms   55%
  //   /specialty/nurse-practitioner  1.43MB  ~5.0ms   50%
  // (and ~40 more state/specialty hubs in the 1.4-1.5MB band). /jobs/federal/va
  // has almost no headroom left and will start returning 503 exceededCpu the way
  // the sitemap did, once it grows a little more. These need their rendered
  // payload cut — cap the job list per hub page and paginate — which is a
  // separate change from this one.
  enableCacheInterception: true,
});
