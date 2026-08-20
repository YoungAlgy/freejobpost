import Link from 'next/link'
import {
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'

/**
 * The 12-column job row used by both federal surfaces:
 * /jobs/federal/[agency] and /jobs/federal/[agency]/[state], on page 1 and on
 * every /p/<n> continuation.
 *
 * Extracted verbatim from those two pages when they were paginated
 * (2026-08-19). Sharing it is the point: a continuation page that drew its rows
 * differently from page 1 would look like a different site halfway through a
 * paginated series. The two callers previously differed only in the hover tint,
 * which is why that stayed a prop instead of being unified away.
 */
export default function FederalJobList({
  jobs,
  hoverClass = 'hover:bg-[#7FBC00]/10',
}: {
  jobs: readonly PublicJob[]
  hoverClass?: string
}) {
  return (
    <ul className="divide-y divide-gray-200 border-y border-gray-200">
      {jobs.map((job) => {
        const loc = locationLabel(job)
        const sal = formatSalary(job.salary_min, job.salary_max)
        const rem = remoteLabel(job.remote_hybrid)
        const emp = employmentLabel(job.employment_type)
        return (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.slug}`}
              className={`grid grid-cols-12 gap-4 py-5 ${hoverClass} transition-colors`}
            >
              <div className="col-span-12 md:col-span-5">
                <div className="font-bold">
                  <span className="truncate">{job.title || job.role}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                  {emp && <span>{emp}</span>}
                  {rem && rem !== 'Onsite' && (
                    <span className="text-[#003D5C] font-bold">{rem}</span>
                  )}
                </div>
              </div>
              <div className="col-span-6 md:col-span-3 text-gray-700 self-center">
                {loc || '—'}
              </div>
              <div className="col-span-6 md:col-span-2 text-gray-700 text-sm self-center">
                {job.specialty || job.role || ''}
              </div>
              <div className="col-span-12 md:col-span-2 font-bold text-right self-center">
                {sal || ''}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
