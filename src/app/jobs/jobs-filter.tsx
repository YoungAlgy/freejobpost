'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'

type Props = {
  jobs: PublicJob[]
  roles: string[]
  states: string[]
}

export default function JobsFilter({ jobs, roles, states }: Props) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<string>('')
  const [state, setState] = useState<string>('')
  const [remote, setRemote] = useState<'' | 'remote' | 'hybrid' | 'onsite'>('')
  const [empType, setEmpType] = useState<string>('')

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase()
    return jobs.filter((j) => {
      if (role && j.role !== role) return false
      if (state && j.state !== state) return false
      if (remote && j.remote_hybrid !== remote) return false
      if (empType && j.employment_type !== empType) return false
      if (qLower) {
        const hay = [j.title, j.role, j.city, j.state, j.specialty]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(qLower)) return false
      }
      return true
    })
  }, [jobs, q, role, state, remote, empType])

  const activeFilterCount = [role, state, remote, empType].filter(Boolean).length

  return (
    <>
      {/* Filter bar */}
      <div className="border-2 border-black bg-gray-50 p-4 md:p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="search"
            placeholder="Search title, role, city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="md:col-span-2 px-4 py-3 bg-white border-2 border-black text-sm font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-4 py-3 bg-white border-2 border-black text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="px-4 py-3 bg-white border-2 border-black text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">All states</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={empType}
            onChange={(e) => setEmpType(e.target.value)}
            className="px-4 py-3 bg-white border-2 border-black text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="">Any type</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="locum">Locum</option>
            <option value="per_diem">Per diem</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold tracking-wider">
          <span className="text-gray-500">LOCATION:</span>
          {(['', 'remote', 'hybrid', 'onsite'] as const).map((r) => (
            <button
              key={r || 'any'}
              type="button"
              onClick={() => setRemote(r)}
              className={`px-3 py-1 border-2 transition-colors ${
                remote === r
                  ? 'bg-black text-white border-black'
                  : 'bg-white border-black hover:bg-green-50'
              }`}
            >
              {r === '' ? 'ANY' : r.toUpperCase()}
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setRole('')
                setState('')
                setRemote('')
                setEmpType('')
                setQ('')
              }}
              className="ml-auto underline hover:text-green-700"
            >
              Clear {activeFilterCount + (q ? 1 : 0)} filter
              {activeFilterCount + (q ? 1 : 0) > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold">
          {filtered.length} {filtered.length === 1 ? 'role' : 'roles'}
          {filtered.length !== jobs.length && ` of ${jobs.length}`}
        </p>
      </div>

      {/* Results list */}
      {filtered.length > 0 ? (
        <ul className="divide-y-2 divide-black border-y-2 border-black">
          {filtered.map((job) => {
            const loc = locationLabel(job)
            const sal = formatSalary(job.salary_min, job.salary_max)
            const rem = remoteLabel(job.remote_hybrid)
            const emp = employmentLabel(job.employment_type)
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.slug}`}
                  className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors"
                >
                  <div className="col-span-12 md:col-span-5">
                    <div className="font-bold">{job.title || job.role}</div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                      {emp && <span>{emp}</span>}
                      {rem && rem !== 'Onsite' && (
                        <span className="text-green-700 font-bold">{rem}</span>
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
      ) : (
        <div className="py-12 text-center border-2 border-black bg-gray-50">
          <p className="font-bold mb-2">No matches.</p>
          <p className="text-gray-600 text-sm">Try widening your filters.</p>
        </div>
      )}
    </>
  )
}
