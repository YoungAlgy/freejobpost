// /sitemap.xml — the sitemap INDEX.
//
// This used to be `src/app/sitemap.ts` (Next's metadata file convention) which
// emitted one 6.8MB <urlset> and was 100% down on Cloudflare Workers' 10ms free
// CPU budget. Full incident writeup + the measurements that drove the redesign
// are at the top of src/lib/sitemap-chunks.ts.
//
// WHY THIS IS A HAND-ROLLED route.ts AND NOT `generateSitemaps()`:
//
// Next 16 CAN split a sitemap, via `export async function generateSitemaps()` in
// a metadata `sitemap.ts`. It does not do what this route needs, verified
// against the installed Next 16.3.0 rather than assumed:
//
//   1. It does NOT emit an index. Next has no sitemapindex support at all —
//      its only serializer, resolveSitemap() in
//      next/dist/build/webpack/loaders/metadata/resolve-route-data.js, emits
//      <urlset> and nothing else. An index has to be hand-written regardless.
//
//   2. It MOVES the parent URL rather than keeping it. In
//      next/dist/lib/metadata/get-metadata-route.js, normalizeMetadataPageToRoute
//      appends the `.xml` extension only when the route is NOT dynamic:
//
//        const mapped = isDynamic ? `${routePagePath}/[__metadata_id__]`
//                                 : `${routePagePath}${metadataRouteExtension}`
//
//      and route-discovery.js passes isDynamic = !!staticInfo.generateSitemaps.
//      So the moment `generateSitemaps` is exported, the route becomes
//      /sitemap/[__metadata_id__] and /sitemap.xml STOPS EXISTING — replaced by
//      /sitemap/0.xml, /sitemap/1.xml, … (Next's own docs confirm the child
//      path: "Your generated sitemaps will be available at /.../sitemap/[id].xml".)
//
// /sitemap.xml is the URL submitted to Google Search Console and Bing Webmaster
// Tools (2026-04-29, see PARTNER_CONTACTS.sitemap), the URL in robots.txt, and
// the URL published on /feeds. Handing back a 404 there to gain nothing but
// framework-native XML serialization is a bad trade, so the framework is left
// alone and the index is written directly. The children live under /sitemaps/*
// for the same reason: /sitemap/* is Next's reserved namespace for
// generateSitemaps output and squatting on it invites a future collision.
//
// Cost: ~3KB body, ~0.014ms of size-scaled interceptor CPU. It is effectively a
// static file that happens to carry per-child <lastmod>.

import { buildSitemapIndex, xmlResponse } from '@/lib/sitemap-chunks'

// MUST be an inline literal, NOT `= SITEMAP_REVALIDATE`. Next statically
// analyzes route segment config at build time and rejects an imported
// identifier with "Invalid segment configuration export detected", which fails
// the whole build. Keep this in sync with SITEMAP_REVALIDATE in
// src/lib/sitemap-chunks.ts — a test pins that constant to this value so
// changing one without the other fails the suite.
export const revalidate = 21600

export async function GET(): Promise<Response> {
  return xmlResponse(await buildSitemapIndex())
}
