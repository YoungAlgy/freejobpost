'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { archiveJob, logout } from './actions'
import { formatSalary, locationLabel, employmentLabel, remoteLabel } from '@/lib/public-jobs'

type Job = {
  id: string
  slug: string
  title: string
  role: string | null
  specialty: string | null
  city: string | null
  state: string | null
  remote_hybrid: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  status: string
  apply_count: number
  view_count: number
  created_at: string
  expires_at: string
}

type Employer = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string
  tier: string
  verified_healthcare_org: boolean
  status: string
}

const FREE_QUOTA = 10

export default function Dashboard({
  employer,
  jobs,
}: {
  employer: Employer
  jobs: Job[]
}) {
  const active = jobs.filter(
    (j) =>
      (j.status === 'active' || j.status === 'pending_review') &&
      new Date(j.expires_at) > new Date()
  )
  const filled = jobs.filter((j) => j.status === 'filled')
  const other = jobs.filter((j) => !active.includes(j) && !filled.includes(j))

  const quota =
    employer.tier === 'pro' || employer.tier === 'enterprise'
      ? Infinity
      : FREE_QUOTA

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">
            Dashboard
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            {employer.company_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {employer.verified_healthcare_org && (
              <span className="border-2 border-black bg-green-50 px-2 py-1 font-bold tracking-wider">
                VERIFIED
              </span>
            )}
            <span className="border-2 border-black px-2 py-1 font-bold tracking-wider uppercase">
              {employer.tier}
            </span>
            <span className="text-gray-500 self-center">
              {active.length}
              {isFinite(quota) ? ` / ${quota}` : ''} active
              {isFinite(quota) && active.length >= quota && ' — archive one to post more'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/post-job"
            className="inline-flex items-center bg-black text-white px-5 py-2.5 font-bold hover:bg-green-700 transition-colors"
          >
            Post a new role →
          </Link>
          <LogoutButton />
        </div>
      </div>

      <Section
        title="Live posts"
        empty="You have no active posts. Post your first role →"
        emptyHref="/post-job"
      >
        {active.map((j) => (
          <JobRow key={j.id} job={j} actionable />
        ))}
      </Section>

      {filled.length > 0 && (
        <Section title="Filled">
          {filled.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </Section>
      )}

      {other.length > 0 && (
        <Section title="Expired & archived">
          {other.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  empty,
  emptyHref,
  children,
}: {
  title: string
  empty?: string
  emptyHref?: string
  children: React.ReactNode
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <section>
      <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-3">
        {title}
      </h2>
      {hasChildren ? (
        <ul className="divide-y-2 divide-black border-y-2 border-black">{children}</ul>
      ) : (
        empty && (
          <div className="py-10 px-4 text-center text-gray-500 border-2 border-dashed border-gray-300">
            {emptyHref ? (
              <Link href={emptyHref} className="font-bold underline hover:text-green-700">
                {empty}
              </Link>
            ) : (
              empty
            )}
          </div>
        )
      )}
    </section>
  )
}

function JobRow({ job, actionable = false }: { job: Job; actionable?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const loc = locationLabel(job as { city: string | null; state: string | null })
  const sal = formatSalary(job.salary_min, job.salary_max)
  const emp = employmentLabel(job.employment_type as never)
  const rem = remoteLabel(job.remote_hybrid as never)

  function onArchive() {
    setErr(null)
    startTransition(async () => {
      const r = await archiveJob(job.id, 'filled')
      if (!r.success) setErr(r.error || 'Failed.')
    })
  }

  return (
    <li>
      <div className="grid grid-cols-12 gap-4 py-4">
        <div className="col-span-12 md:col-span-5">
          <Link
            href={`/jobs/${job.slug}`}
            className="font-bold hover:text-green-700"
            target="_blank"
          >
            {job.title}
          </Link>
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
            {emp && <span>{emp}</span>}
            {rem && rem !== 'Onsite' && (
              <span className="text-green-700 font-bold">{rem}</span>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>
        <div className="col-span-6 md:col-span-3 text-gray-700 text-sm self-center">
          {loc || '—'}
        </div>
        <div className="col-span-6 md:col-span-2 self-center text-sm">
          <span className="font-bold">{job.apply_count}</span>
          <span className="text-gray-500 ml-1">
            {job.apply_count === 1 ? 'apply' : 'applies'}
          </span>
        </div>
        <div className="col-span-12 md:col-span-2 self-center flex items-center justify-end gap-2 text-sm">
          {sal && <span className="font-bold hidden md:inline">{sal}</span>}
          {actionable && (
            <button
              type="button"
              onClick={onArchive}
              disabled={pending}
              className="text-xs font-bold underline hover:text-green-700 disabled:opacity-50"
            >
              {pending ? 'Archiving…' : 'Mark filled'}
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-700 pb-3 pl-1">{err}</p>}
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'text-green-700',
    pending_review: 'text-amber-600',
    filled: 'text-gray-500',
    expired: 'text-gray-400',
    spam: 'text-red-600',
  }
  const label: Record<string, string> = {
    active: 'LIVE',
    pending_review: 'PENDING REVIEW',
    filled: 'FILLED',
    expired: 'EXPIRED',
    spam: 'FLAGGED',
  }
  return (
    <span className={`font-bold tracking-wider ${colors[status] ?? 'text-gray-500'}`}>
      {label[status] ?? status.toUpperCase()}
    </span>
  )
}

function LogoutButton() {
  const [pending, startTransition] = useTransition()
  return (
    <form action={() => startTransition(async () => await logout())}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center border-2 border-black px-5 py-2.5 font-bold hover:bg-black hover:text-white transition-colors disabled:opacity-50"
      >
        Sign out
      </button>
    </form>
  )
}
