import Link from 'next/link'
import { hubPageHref } from '@/lib/hub-pagination'

/**
 * Crawlable pagination nav for the job-list hub pages.
 *
 * Every control is a real <Link> (which renders a plain <a href>), never a
 * button or a client-side "load more". That is the whole point: the 2026-08-19
 * CPU fix caps how many jobs each hub page renders, so the only thing keeping
 * the rest of the corpus reachable from the hub is that a crawler can follow
 * these hrefs. A JS-gated control would have traded a CPU problem for a
 * deindexing problem.
 *
 * Page 1 is always the bare hub path (never /p/1) — see hubPageHref.
 */
export default function HubPagination({
  basePath,
  page,
  totalPages,
  label = 'jobs',
}: {
  /** Hub root, no trailing slash, e.g. "/state/florida". */
  basePath: string
  /** Current page, 1-indexed. */
  page: number
  totalPages: number
  /** Plural noun for the screen-reader summary, e.g. "Florida jobs". */
  label?: string
}) {
  if (totalPages <= 1) return null

  const current = Math.min(Math.max(1, page), totalPages)

  // Windowed page list: always show first and last, plus the two neighbours of
  // the current page. Keeps the link count (and the markup this adds back to
  // every cache entry) constant instead of growing with the corpus.
  const nums = new Set<number>([1, totalPages, current - 1, current, current + 1])
  const pages = [...nums].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)

  const linkBase =
    'inline-flex items-center justify-center min-w-10 px-3 py-2 text-sm font-bold border border-gray-200 rounded-md hover:bg-[#003D5C] hover:text-white transition-colors'

  return (
    <nav
      className="mt-8 flex flex-wrap items-center gap-2"
      aria-label={`Pagination for ${label}`}
    >
      {current > 1 ? (
        <Link
          href={hubPageHref(basePath, current - 1)}
          rel="prev"
          className={linkBase}
        >
          ← Previous
        </Link>
      ) : (
        <span className={`${linkBase} opacity-40 pointer-events-none`} aria-hidden="true">
          ← Previous
        </span>
      )}

      {pages.map((n, i) => {
        // Render a gap marker when the window skipped over pages, so the nav
        // reads correctly instead of implying 1, 2, 9 are adjacent.
        const gap = i > 0 && n - pages[i - 1] > 1
        return (
          <span key={n} className="inline-flex items-center gap-2">
            {gap && (
              <span className="px-1 text-sm text-gray-500" aria-hidden="true">
                …
              </span>
            )}
            {n === current ? (
              <span
                aria-current="page"
                className="inline-flex items-center justify-center min-w-10 px-3 py-2 text-sm font-bold border border-[#003D5C] bg-[#003D5C] text-white rounded-md"
              >
                {n}
              </span>
            ) : (
              <Link href={hubPageHref(basePath, n)} className={linkBase}>
                {n}
              </Link>
            )}
          </span>
        )
      })}

      {current < totalPages ? (
        <Link
          href={hubPageHref(basePath, current + 1)}
          rel="next"
          className={linkBase}
        >
          Next →
        </Link>
      ) : (
        <span className={`${linkBase} opacity-40 pointer-events-none`} aria-hidden="true">
          Next →
        </span>
      )}

      <span className="w-full text-xs text-gray-500 mt-1">
        Page {current} of {totalPages}
      </span>
    </nav>
  )
}
