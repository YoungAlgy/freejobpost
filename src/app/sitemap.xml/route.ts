// /sitemap.xml — the sitemap INDEX.
//
// A hand-written route preserves the established /sitemap.xml index URL. The
// index itself is database-free. Child routes carry the public URLs and dates.

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
