'use client'

import Link from 'next/link'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  /** Employer IDs whose verified_at is non-null. Empty array when none. */
  verifiedEmployerIds: string[]
}

type RemoteFilter = '' | 'remote' | 'hybrid' | 'onsite'

const VALID_REMOTE: ReadonlySet<RemoteFilter> = new Set(['', 'remote', 'hybrid', 'onsite'])
const VALID_EMP_TYPE: ReadonlySet<string> = new Set([
  '',
  'full_time',
  'part_time',
  'contract',
  'locum',
  'per_diem',
  'internship',
])

export default function JobsFilter({ jobs, roles, states, verifiedEmployerIds }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifiedSet = useMemo(() => new Set(verifiedEmployerIds), [verifiedEmployerIds])

  // Initial state pulled from URL — supports deep links like /jobs?q=Physician
  // or /jobs?role=RN&state=FL. Whitelist values that come from the URL so a
  // hostile link can't seed the state with garbage that breaks the UI.
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  // debouncedQ trails q by 300 ms so typing doesn't thrash the filter
  // on every keystroke. At 500 jobs this is imperceptible; at 5K it matters.
  const [debouncedQ, setDebouncedQ] = useState(q)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(id)
  }, [q])
  const [role, setRole] = useState<string>(() => {
    const v = searchParams.get('role') ?? ''
    return v && roles.includes(v) ? v : ''
  })
  const [state, setState] = useState<string>(() => {
    const v = searchParams.get('state') ?? ''
    return v && states.includes(v) ? v : ''
  })
  const [remote, setRemote] = useState<RemoteFilter>(() => {
    const v = (searchParams.get('remote') ?? '') as RemoteFilter
    return VALID_REMOTE.has(v) ? v : ''
  })
  const [empType, setEmpType] = useState<string>(() => {
    const v = searchParams.get('type') ?? ''
    return VALID_EMP_TYPE.has(v) ? v : ''
  })
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(
    () => searchParams.get('verified') === '1'
  )

  // Push current filter state back to the URL (replace, no reload). Skip the
  // very first render since we just READ from the URL. After that, every
  // filter change updates ?q&role&state&remote&type so reload / share /
  // back-button all work as expected.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const params = new URLSearchParams()
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim())
    if (role) params.set('role', role)
    if (state) params.set('state', state)
    if (remote) params.set('remote', remote)
    if (empType) params.set('type', empType)
    if (verifiedOnly) params.set('verified', '1')
    const qs = params.toString()
    router.replace(qs ? `/jobs?${qs}` : '/jobs', { scroll: false })
  }, [debouncedQ, role, state, remote, empType, verifiedOnly, router])

  const filtered = useMemo(() => {
    const qLower = debouncedQ.trim().toLowerCase()
    return jobs.filter((j) => {
      if (role && j.role !== role) return false
      if (state && j.state !== state) return false
      if (remote && j.remote_hybrid !== remote) return false
      if (empType && j.employment_type !== empType) return false
      if (verifiedOnly && (!j.employer_id || !verifiedSet.has(j.employer_id))) return false
      if (qLower) {
        const hay = [j.title, j.role, j.city, j.state, j.specialty]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(qLower)) return false
      }
      return true
    })
    // Depend on debouncedQ (the 300ms-trailing copy) — depending on `q`
    // here would re-filter on every keystroke and defeat the debounce.
  }, [jobs, debouncedQ, role, state, remote, empType, verifiedOnly, verifiedSet])

  const activeFilterCount = [role, state, remote, empType].filter(Boolean).length + (verifiedOnly ? 1 : 0)

  return (
    <>
      {/* Filter bar */}
      <div className="border-2 border-black bg-gray-50 p-4 md:p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="sr-only" htmlFor="jobs-search">
            Search jobs by title, role, or city
          </label>
          <input
            id="jobs-search"
            type="search"
            placeholder="Search title, role, city…"
            aria-label="Search jobs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="md:col-span-2 px-4 py-3 bg-white border-2 border-black text-sm font-medium placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <select
            aria-label="Filter by role"
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
            aria-label="Filter by state"
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
            aria-label="Filter by employment type"
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
          {verifiedSet.size > 0 && (
            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={`px-3 py-1 border-2 transition-colors flex items-center gap-1.5 ${
                verifiedOnly
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white border-black hover:bg-green-50'
              }`}
              aria-pressed={verifiedOnly}
              title={`Show only the ${verifiedSet.size} verified employer${verifiedSet.size === 1 ? '' : 's'}`}
            >
              <span aria-hidden="true">✓</span>
              VERIFIED ONLY ({verifiedSet.size})
            </button>
          )}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setRole('')
                setState('')
                setRemote('')
                setEmpType('')
                setVerifiedOnly(false)
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
            const isVerified = !!job.employer_id && verifiedSet.has(job.employer_id)
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.slug}`}
                  className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors"
                >
                  <div className="col-span-12 md:col-span-5">
                    <div className="font-bold flex items-center gap-1.5">
                      {isVerified && (
                        <svg
                          viewBox="0 0 16 16"
                          width="14"
                          height="14"
                          aria-label="Verified employer"
                          className="text-green-700 shrink-0"
                        >
                          <circle cx="8" cy="8" r="7" fill="currentColor" />
                          <path
                            d="M4.5 8.2 L7 10.5 L11.5 5.8"
                            fill="none"
                            stroke="white"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <span className="truncate">{job.title || job.role}</span>
                    </div>
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
