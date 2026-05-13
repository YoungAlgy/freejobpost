// IndexNow — push URL change notifications to participating search engines.
//
// Supported engines (single POST forwards to all): Bing, Yandex, Naver,
// Seznam, Yep. Google is NOT a participant (publicly tested it in 2022 for
// sustainability research, never adopted). For a US-focused healthcare job
// board, expected impact is modest — Bing+Yandex+Naver+Seznam+Yep have
// <5% combined US search share. We ship it anyway because it's cheap and
// every percentage of crawl-time savings on fresh job listings matters.
//
// Key proof-of-ownership: the IndexNow API verifies that
// `https://freejobpost.co/<KEY>.txt` is served and contains <KEY>. Both
// the public/<KEY>.txt file and the constant below must match.
//
// Spec: https://www.indexnow.org/documentation
// Bing implementation notes: https://blogs.bing.com/webmaster/may-2025/IndexNow-Drives-Smarter-and-Faster-Content-Discovery

const INDEXNOW_KEY = '3d69df968dedaf8cf3561b1bb56bbd3d'
const HOST = 'freejobpost.co'

/**
 * Notify IndexNow that one or more URLs have changed. Fire-and-forget —
 * the function returns once the POST completes (or errors), but the caller
 * should NOT await it in a request-blocking context. Worst-case latency on
 * the upstream API is ~5s; we don't want to block the verify page on it.
 *
 * Errors are logged and swallowed — IndexNow isn't critical-path.
 */
export async function notifyIndexNow(urls: string[]): Promise<void> {
  if (urls.length === 0) return
  if (urls.length > 10_000) {
    // The spec accepts up to 10K URLs per request. We never batch that
    // many at once; cap defensively to surface bugs.
    console.warn(`[indexnow] truncating ${urls.length} URLs to 10000`)
    urls = urls.slice(0, 10_000)
  }

  const body = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  }

  try {
    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
    // IndexNow returns 200/202 on success, 400 for malformed, 403 for key
    // mismatch, 422 for quota/abuse, 429 for rate-limit. Don't throw; just
    // log so a misconfiguration surfaces in logs.
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[indexnow] ${res.status} ${text.slice(0, 200)}`)
    }
  } catch (e) {
    console.warn('[indexnow] fetch error:', e instanceof Error ? e.message : 'unknown')
  }
}

/** Convenience: notify for a single job slug. Used after post-job verify. */
export async function notifyIndexNowForJob(slug: string): Promise<void> {
  return notifyIndexNow([`https://${HOST}/jobs/${slug}`])
}
