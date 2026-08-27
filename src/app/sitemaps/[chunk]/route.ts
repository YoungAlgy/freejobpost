// /sitemaps/<child> — every child sitemap listed in the /sitemap.xml index.
//
//   /sitemaps/pages.xml       ~1,000 non-job URLs (hubs, static, matrices, employers)
//   /sitemaps/jobs-0.xml      the /jobs/<slug> corpus, split into JOB_SITEMAP_CHUNKS
//     … through jobs-19.xml   fixed, contiguous UUID ranges
//
// ONE dynamic route rather than 21 near-identical folders. That is a deliberate
// correctness choice, not brevity: generateStaticParams, the <sitemapindex>, and
// robots.txt all read the SAME SITEMAP_CHILDREN constant, so robots.txt cannot
// advertise a sitemap that was never generated, and a generated child cannot go
// unlinked. With 21 hand-written folders those three lists drift the first time
// someone changes the chunk count.
//
// These are fully prerendered at build (every param is enumerated below), so
// each one lands in the prerender manifest as a concrete path and is served
// straight out of the R2 incremental cache by OpenNext's cache interceptor —
// the Next.js server is never entered. Verified against the real build output,
// not assumed: see the route list + per-file sizes in the commit message.
//
// dynamicParams = false so /sitemaps/anything-else.xml is a 404 instead of an
// on-demand render. Nothing should ever request a child that is not in the
// index, and an unbounded param here would be a free way to make the Worker
// render arbitrary sitemaps on request.

import {
  SITEMAP_CHILDREN,
  SITEMAP_ISR_REQUEST_TIMEOUT_MS,
  buildChildSitemap,
  xmlResponse,
} from '@/lib/sitemap-chunks'

// MUST be an inline literal, NOT `= SITEMAP_REVALIDATE`. Next statically
// analyzes route segment config at build time and rejects an imported
// identifier with "Invalid segment configuration export detected", which fails
// the whole build. Keep this in sync with SITEMAP_REVALIDATE in
// src/lib/sitemap-chunks.ts — a test pins that constant to this value so
// changing one without the other fails the suite.
export const revalidate = 21600
export const dynamicParams = false

export function generateStaticParams(): { chunk: string }[] {
  return SITEMAP_CHILDREN.map((chunk) => ({ chunk }))
}

type SitemapRequestScope = {
  signal: AbortSignal
  cleanup: () => void
}

function sitemapRequestScope(req: Request): SitemapRequestScope {
  // OpenNext's queue revalidation is a HEAD self-fetch. Use the method instead
  // of reading request headers, because headers are a dynamic API and would
  // disable build-time prerendering for all 21 concrete child paths.
  if (req.method !== 'HEAD') {
    return { signal: req.signal, cleanup: () => {} }
  }

  const controller = new AbortController()
  const isrTimeoutError = new DOMException(
    `Sitemap ISR request timed out after ${SITEMAP_ISR_REQUEST_TIMEOUT_MS}ms`,
    'TimeoutError',
  )
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    req.signal.removeEventListener('abort', abortFromRequest)
  }
  const abortFromRequest = () => {
    cleanup()
    controller.abort(req.signal.reason)
  }

  if (req.signal.aborted) {
    abortFromRequest()
  } else {
    req.signal.addEventListener('abort', abortFromRequest, { once: true })
    timeoutId = setTimeout(() => {
      cleanup()
      controller.abort(isrTimeoutError)
    }, SITEMAP_ISR_REQUEST_TIMEOUT_MS)
  }

  return { signal: controller.signal, cleanup }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chunk: string }> },
): Promise<Response> {
  const { chunk } = await params
  const scope = sitemapRequestScope(req)

  try {
    const xml = await buildChildSitemap(chunk, scope.signal)
    if (xml === null) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    return xmlResponse(xml)
  } finally {
    // Let loader failures throw through Next's ISR error path. Returning a 503
    // Response here would still create an APP_ROUTE cache entry and could replace
    // the last-good XML with that error response.
    scope.cleanup()
  }
}
