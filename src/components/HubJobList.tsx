import Link from 'next/link'
import {
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import { stripSalarySuffix } from '@/lib/clean-labels'

/**
 * The job-card list used by the non-federal hubs, on page 1 and on every /p/<n>
 * continuation (see src/lib/hub-pagination.ts for why continuations exist).
 *
 * Extracted verbatim when those hubs were paginated (2026-08-19).
 * /state/[slug], /specialty/[slug] and /specialty/[slug]/[state] had
 * byte-identical copies of the `standard` markup between them — three copies of
 * one card is exactly how the specialty `.or()` filter drifted into a bug back
 * in May, so they now share one. /city/[slug] renders a denser row and keeps it
 * as the `compact` variant rather than being silently restyled by this refactor.
 */
export default function HubJobList({
  jobs,
  variant = 'standard',
}: {
  jobs: readonly PublicJob[]
  variant?: 'standard' | 'compact'
}) {
  if (variant === 'compact') {
    return (
      <ul className="divide-y divide-gray-200 border-y border-gray-200">
        {jobs.map((j) => {
          const loc = locationLabel(j)
          const sal = formatSalary(j.salary_min, j.salary_max)
          const emp = employmentLabel(j.employment_type)
          const rem = remoteLabel(j.remote_hybrid)
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.slug}`}
                className="block py-4 hover:bg-[#7FBC00]/10 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold leading-tight">
                      {stripSalarySuffix(j.title) || j.title}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {loc || '—'}
                      {emp && <> · <span>{emp}</span></>}
                      {rem && rem !== 'Onsite' && <> · <span>{rem}</span></>}
                    </p>
                  </div>
                  {sal && (
                    <div className="text-sm font-bold tabular-nums shrink-0">
                      {sal}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="border-t border-gray-200">
      {jobs.map((j) => (
        <li key={j.id} className="border-b border-black/10 py-5">
          <Link href={`/jobs/${j.slug}`} className="group block">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black tracking-tight group-hover:text-[#003D5C] mb-1">
                  {stripSalarySuffix(j.title) || j.title}
                </h2>
                <p className="text-sm text-gray-700">
                  {locationLabel(j)} · {employmentLabel(j.employment_type)}
                  {j.remote_hybrid ? ` · ${remoteLabel(j.remote_hybrid)}` : ''}
                  {j.specialty ? ` · ${stripSalarySuffix(j.specialty)}` : ''}
                </p>
              </div>
              {(j.salary_min || j.salary_max) && (
                <div className="text-sm font-bold whitespace-nowrap shrink-0">
                  {formatSalary(j.salary_min, j.salary_max)}
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
