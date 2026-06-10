import { NextResponse, type NextRequest } from 'next/server'

// Strip query strings from the heavy feed + sitemap routes (2026-06 audit,
// F50). These responses ignore query params entirely, but the CDN cache key
// includes them — so any ?utm=/?cb= variant bypassed the cached copy and
// forced a full origin render of a multi-MB XML document (the 40-batch
// corpus pull). A 308 to the bare path collapses every variant onto the one
// cached entry. Crawlers follow 308s and consolidate signals.
//
// Matcher scope is EXACTLY these routes — middleware runs on nothing else,
// so the per-request overhead for normal pages is zero.
export function middleware(req: NextRequest) {
  const { nextUrl } = req
  if (nextUrl.search) {
    const clean = nextUrl.clone()
    clean.search = ''
    return NextResponse.redirect(clean, 308)
  }
  return NextResponse.next()
}

export const config = {
  // :path+ (one or more segments) NOT :path* — the bare /feeds is a
  // human-facing HTML page whose inbound links may carry UTM params we want
  // to keep (round-2 audit catch). Only the XML feed leaves get stripped.
  matcher: ['/jobs.xml', '/sitemap.xml', '/feeds/:path+'],
}
