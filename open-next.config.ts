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
  // CAVEAT, because it is not free for everything: the interceptor computes the
  // ETag as md5 over the whole response body (computeCacheControl -> hash(body)),
  // so its cost scales with page weight. That is a clear win for small routes
  // and roughly a wash for the heaviest ones. It does NOT rescue /sitemap.xml,
  // whose cache entry is 6.8MB / 34,058 URLs — md5 alone on that body measures
  // ~12ms locally, over budget before the JSON.parse of the cache object. That
  // route needs to be split into chunked sitemaps; see the note in
  // src/app/sitemap.ts. The 1.5-2.7MB state/specialty hub entries are worth
  // watching for the same reason.
  enableCacheInterception: true,
});
