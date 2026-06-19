'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { archiveJob, logout } from './actions'
import { formatSalary, locationLabel, employmentLabel, remoteLabel } from '@/lib/public-jobs'
import type { Application } from './page'

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
  applications = [],
  publicSlug = null,
}: {
  employer: Employer
  jobs: Job[]
  applications?: Application[]
  /** Slug for the public /employers/[slug] page — null until migration runs */
  publicSlug?: string | null
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
              <span className="rounded-md border border-[#00B5D4] text-[#00B5D4] px-2 py-1 font-bold tracking-wider">
                VERIFIED
              </span>
            )}
            <span className="rounded-md border border-gray-200 px-2 py-1 font-bold tracking-wider uppercase">
              {employer.tier}
            </span>
            <span className="text-gray-500 self-center">
              {active.length}
              {isFinite(quota) ? ` / ${quota}` : ''} active
              {isFinite(quota) && active.length >= quota && ', archive one to post more'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {publicSlug && (
            <Link
              href={`/employers/${publicSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-gray-200 px-5 py-2.5 font-bold hover:bg-[#003D5C] hover:text-white transition-colors text-sm"
            >
              View public page ↗
            </Link>
          )}
          <Link
            href={`/post-job?co=${encodeURIComponent(employer.company_name)}&cn=${encodeURIComponent(employer.contact_name ?? '')}`}
            className="inline-flex items-center rounded-md bg-[#7FBC00] text-white px-5 py-2.5 font-bold hover:bg-[#6DA300] transition-colors"
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

      {/* Applications — always show this section so employers can find
          contact info even if the email notification was missed. */}
      <ApplicationsSection applications={applications} />
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
        <ul className="divide-y divide-gray-200 border-y border-gray-200">{children}</ul>
      ) : (
        empty && (
          <div className="py-10 px-4 text-center text-gray-500 rounded-xl border border-dashed border-gray-300">
            {emptyHref ? (
              <Link href={emptyHref} className="font-bold underline text-[#003D5C] hover:text-[#002A40]">
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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const loc = locationLabel(job as { city: string | null; state: string | null })
  const sal = formatSalary(job.salary_min, job.salary_max)
  const emp = employmentLabel(job.employment_type as never)
  const rem = remoteLabel(job.remote_hybrid as never)

  function onArchive() {
    // L123: archiving a live post on a single misclick is too easy. Require a
    // confirm — first click arms, second click archives.
    if (!confirmArchive) {
      setConfirmArchive(true)
      return
    }
    setConfirmArchive(false)
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
            className="font-bold hover:text-[#003D5C]"
            target="_blank"
          >
            {job.title}
          </Link>
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
            {emp && <span>{emp}</span>}
            {rem && rem !== 'Onsite' && (
              <span className="text-[#003D5C] font-bold">{rem}</span>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>
        <div className="col-span-6 md:col-span-3 text-gray-700 text-sm self-center">
          {loc || '—'}
        </div>
        <div className="col-span-6 md:col-span-2 self-center text-sm space-y-0.5">
          <div>
            <span className="font-bold">{job.apply_count}</span>
            <span className="text-gray-500 ml-1">
              {job.apply_count === 1 ? 'apply' : 'applies'}
            </span>
          </div>
          {job.status === 'active' && (
            <div className="text-xs text-gray-400">
              expires {new Date(job.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <div className="col-span-12 md:col-span-2 self-center flex items-center justify-end gap-2 text-sm">
          {sal && <span className="font-bold hidden md:inline">{sal}</span>}
          {actionable && (
            <button
              type="button"
              onClick={onArchive}
              disabled={pending}
              className="text-xs font-bold underline hover:text-[#003D5C] disabled:opacity-50"
            >
              {pending ? 'Archiving…' : confirmArchive ? 'Click again to confirm' : 'Mark filled'}
            </button>
          )}
        </div>
      </div>
      {err && <p role="alert" className="text-xs text-red-700 pb-3 pl-1">{err}</p>}
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'text-[#003D5C]',
    pending_review: 'text-amber-600',
    filled: 'text-gray-500',
    expired: 'text-gray-500',
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
        className="inline-flex items-center rounded-md border border-gray-200 px-5 py-2.5 font-bold hover:bg-[#003D5C] hover:text-white transition-colors disabled:opacity-50"
      >
        Sign out
      </button>
    </form>
  )
}

// ── Applications section ───────────────────────────────────────────────────
// Shows all applications across the employer's jobs, newest first.
// Gives employers a fallback way to reach applicants if the email notification
// was missed (e.g., during the SES sandbox period before AWS production access).

function ApplicationsSection({ applications }: { applications: Application[] }) {
  const [expanded, setExpanded] = useState(false)
  const PREVIEW = 5

  if (applications.length === 0) {
    return (
      <section>
        <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-3">
          Applications
        </h2>
        <div className="py-8 px-4 text-center text-gray-500 rounded-xl border border-dashed border-gray-300">
          No applications yet. When candidates apply to your roles, their contact info
          appears here as a backup if an email notification is missed.
        </div>
      </section>
    )
  }

  const visible = expanded ? applications : applications.slice(0, PREVIEW)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase">
          Applications
          <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
            ({applications.length})
          </span>
        </h2>
        <p className="text-xs text-gray-400">
          Contact info shown in case email notification was missed
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-200">
        {visible.map((app) => (
          <ApplicationRow key={app.application_id} app={app} />
        ))}
      </div>

      {applications.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-3 text-xs font-bold underline hover:text-[#003D5C]"
        >
          {expanded
            ? 'Show fewer'
            : `Show all ${applications.length} applications`}
        </button>
      )}
    </section>
  )
}

function ApplicationRow({ app }: { app: Application }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const date = new Date(app.applied_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
  const loc = [app.job_city, app.job_state].filter(Boolean).join(', ')

  return (
    <div className="p-4">
      <div className="grid grid-cols-12 gap-3 items-start">
        {/* Candidate */}
        <div className="col-span-12 md:col-span-4">
          <p className="font-bold text-sm">
            {app.first_name} {app.last_name}
            {app.credential && (
              <span className="ml-1 font-normal text-gray-500">{app.credential}</span>
            )}
          </p>
          {app.specialty && (
            <p className="text-xs text-gray-500 mt-0.5">{app.specialty}</p>
          )}
        </div>

        {/* Contact */}
        <div className="col-span-12 md:col-span-4 text-sm space-y-0.5">
          <a
            href={`mailto:${app.email}`}
            className="block font-medium underline hover:text-[#003D5C] break-all"
          >
            {app.email}
          </a>
          {app.phone && (
            <a
              href={`tel:${app.phone}`}
              className="block text-gray-600 hover:text-[#003D5C]"
            >
              {app.phone}
            </a>
          )}
        </div>

        {/* Job + date */}
        <div className="col-span-12 md:col-span-4 text-sm text-right">
          <Link
            href={`/jobs/${app.job_slug}`}
            className="block text-gray-700 hover:text-[#003D5C] truncate"
            target="_blank"
          >
            {app.job_title}
            {loc && <span className="text-gray-400 ml-1 text-xs">- {loc}</span>}
          </Link>
          <p className="text-xs text-gray-400 mt-0.5">{date}</p>
          {app.cover_note && (
            <button
              type="button"
              onClick={() => setNoteOpen((o) => !o)}
              aria-expanded={noteOpen}
              className="text-xs font-bold underline hover:text-[#003D5C] mt-1"
            >
              {noteOpen ? 'Hide note' : 'Cover note'}
            </button>
          )}
        </div>
      </div>

      {noteOpen && app.cover_note && (
        <div className="mt-3 border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {app.cover_note}
        </div>
      )}
    </div>
  )
}
