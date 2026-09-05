'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { archiveJob, logout } from './actions'
import { formatSalary, locationLabel, employmentLabel, remoteLabel } from '@/lib/public-jobs'
import { employerJobStatus, markJobFilled } from '@/lib/employer-dashboard'
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
  company_name: string
  contact_name: string | null
  verified_healthcare_org: boolean
}

export default function Dashboard({
  employer,
  jobs,
  applications = [],
  totalApplications,
  publicSlug = null,
}: {
  employer: Employer
  jobs: Job[]
  applications?: Application[]
  /** Real total across all of the employer's applications; may exceed applications.length (capped at 50). Falls back to applications.length if the backend hasn't started sending it yet. */
  totalApplications?: number
  /** Slug for the public /employers/[slug] page — null until migration runs */
  publicSlug?: string | null
}) {
  const [filledIds, setFilledIds] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const displayJobs = jobs.map((job) => ({
    ...job,
    status: filledIds.includes(job.id) ? 'filled' : employerJobStatus(job, now),
  }))
  const active = displayJobs.filter((job) => job.status === 'active')
  const waiting = displayJobs.filter((job) => job.status === 'pending_review')
  const closed = displayJobs.filter((job) => job.status !== 'active' && job.status !== 'pending_review')

  function onFilled(job: Job) {
    setFilledIds((ids) => [...ids, job.id])
    setNotice(`Marked filled: ${job.title}. Applications already received remain below.`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">
            Manage jobs
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight break-words">
            {employer.company_name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {employer.verified_healthcare_org && (
              <span className="rounded-md border border-[#247A8A] text-[#247A8A] px-2 py-1 font-bold tracking-wider">
                VERIFIED
              </span>
            )}
            <span className="text-gray-500 self-center">
              {active.length} live {active.length === 1 ? 'job' : 'jobs'}
              {waiting.length > 0 && ` · ${waiting.length} awaiting verification`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/post-job?co=${encodeURIComponent(employer.company_name)}&cn=${encodeURIComponent(employer.contact_name ?? '')}`}
            className="inline-flex min-h-11 items-center rounded-md bg-[#276749] text-white px-5 py-2.5 font-bold hover:bg-[#1F563B] transition-colors"
          >
            Post a job
          </Link>
          {publicSlug && (
            <Link
              href={`/employers/${publicSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-5 py-2.5 font-bold hover:bg-[#17324D] hover:text-white transition-colors text-sm"
            >
              View public page ↗
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>

      <nav aria-label="Dashboard sections" className="flex flex-wrap gap-2 text-sm font-bold">
        <a href="#jobs" className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-4">Jobs</a>
        <a href="#applications" className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-4">Applications</a>
        {closed.length > 0 && <a href="#closed-jobs" className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-4">Closed jobs</a>}
      </nav>
      {notice && <p role="status" className="rounded-md bg-green-50 p-4 text-sm text-green-900 break-words">{notice}</p>}

      <div id="jobs" className="space-y-8 scroll-mt-24">
      <Section
        title="Live jobs"
        empty={waiting.length > 0 ? 'No jobs are live yet. Your posts awaiting verification are below.' : 'No live jobs. Post a job to get started.'}
        emptyHref={waiting.length > 0 ? undefined : '/post-job'}
      >
        {active.map((j) => (
          <JobRow key={j.id} job={j} actionable onFilled={() => onFilled(j)} />
        ))}
      </Section>

      {waiting.length > 0 && (
        <Section title="Awaiting verification">
          {waiting.map((j) => (
            <JobRow key={j.id} job={j} actionable onFilled={() => onFilled(j)} />
          ))}
        </Section>
      )}
      </div>

      {/* Applications — always show this section so employers can find
          contact info even if the email notification was missed. */}
      <ApplicationsSection
        applications={applications}
        totalApplications={totalApplications ?? applications.length}
      />
      {closed.length > 0 && (
        <div id="closed-jobs" className="scroll-mt-24">
          <Section title="Closed jobs">
            {closed.map((j) => <JobRow key={j.id} job={j} />)}
          </Section>
        </div>
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
        <ul className="divide-y divide-gray-200 border-y border-gray-200">{children}</ul>
      ) : (
        empty && (
          <div className="py-10 px-4 text-center text-gray-500 rounded-xl border border-dashed border-gray-300">
            {emptyHref ? (
              <Link href={emptyHref} className="font-bold underline text-[#17324D] hover:text-[#17324D]">
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

function JobRow({ job, actionable = false, onFilled }: { job: Job; actionable?: boolean; onFilled?: () => void }) {
  const [pending, startTransition] = useTransition()
  const fillInFlightRef = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const loc = locationLabel(job as { city: string | null; state: string | null })
  const sal = formatSalary(job.salary_min, job.salary_max)
  const emp = employmentLabel(job.employment_type as never)
  const rem = remoteLabel(job.remote_hybrid as never)

  function onArchive() {
    if (fillInFlightRef.current || pending || uncertain) return
    fillInFlightRef.current = true
    setErr(null)
    startTransition(async () => {
      try {
        const result = await markJobFilled(() => archiveJob(job.id, 'filled'))
        setConfirmArchive(false)
        if (result.state === 'filled') onFilled?.()
        else {
          setErr(result.message)
          setUncertain(result.state === 'unknown')
        }
      } finally {
        fillInFlightRef.current = false
      }
    })
  }

  return (
    <li>
      <div className="grid grid-cols-12 gap-4 py-4">
        <div className="col-span-12 md:col-span-5 min-w-0">
          <Link
            href={`/jobs/${job.slug}`}
            className="font-bold hover:text-[#17324D] break-words"
            target="_blank"
            rel="noopener noreferrer"
          >
            {job.title}
          </Link>
          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
            {emp && <span>{emp}</span>}
            {rem && rem !== 'Onsite' && (
              <span className="text-[#17324D] font-bold">{rem}</span>
            )}
            <StatusBadge status={job.status} />
          </div>
        </div>
        <div className="col-span-12 sm:col-span-6 md:col-span-3 min-w-0 text-gray-700 text-sm self-center break-words">
          {loc || 'Location not added'}
          {sal && <div className="mt-1 font-bold">{sal}</div>}
        </div>
        <div className="col-span-6 md:col-span-2 self-center text-sm space-y-0.5">
          {job.status === 'active' && (
            <div className="text-xs text-gray-500">
              Expires {new Date(job.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <div className="col-span-12 md:col-span-2 self-center flex items-center justify-end gap-2 text-sm">
          {actionable && (
            <button
              type="button"
              onClick={() => { setErr(null); setConfirmArchive(true) }}
              disabled={pending || uncertain || confirmArchive}
              className="min-h-11 px-2 text-sm font-bold underline hover:text-[#17324D] disabled:opacity-50"
            >
              {pending ? 'Saving...' : 'Mark filled'}
            </button>
          )}
        </div>
      </div>
      {confirmArchive && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className="font-bold break-words">Mark {job.title} filled?</p>
          <p className="mt-1 text-gray-600">This closes the job. Applications already received stay in your dashboard.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onArchive} disabled={pending} className="min-h-11 rounded-md bg-[#17324D] px-4 font-bold text-white disabled:opacity-50">{pending ? 'Saving...' : 'Confirm filled'}</button>
            <button type="button" onClick={() => setConfirmArchive(false)} disabled={pending} className="min-h-11 rounded-md border border-gray-300 px-4 font-bold disabled:opacity-50">Cancel</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="text-xs text-red-700 pb-3 pl-1">{err}</p>}
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'text-[#17324D]',
    pending_review: 'text-amber-600',
    filled: 'text-gray-500',
    expired: 'text-gray-500',
    spam: 'text-red-600',
  }
  const label: Record<string, string> = {
    active: 'LIVE',
    pending_review: 'AWAITING VERIFICATION',
    filled: 'FILLED',
    expired: 'EXPIRED',
    spam: 'FLAGGED',
    unavailable: 'STATUS UNAVAILABLE',
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
        className="inline-flex min-h-11 items-center rounded-md border border-gray-200 px-5 py-2.5 font-bold hover:bg-[#17324D] hover:text-white transition-colors disabled:opacity-50"
      >
        {pending ? 'Signing out...' : 'Sign out'}
      </button>
    </form>
  )
}

// Filters only the application rows already supplied by the scoped server page.
// The server caps this list at 50. This is not a search of older applications.

function ApplicationsSection({
  applications,
  totalApplications,
}: {
  applications: Application[]
  totalApplications: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [jobId, setJobId] = useState('')
  const PREVIEW = 5
  // The backend caps the fetched list at 50, newest first. If the real total
  // is bigger, older applicants exist that this dashboard cannot show yet.
  const hasHiddenOlderApplications = totalApplications > applications.length

  if (applications.length === 0) {
    return (
      <section id="applications" className="scroll-mt-24">
        <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-3">
          Applications
        </h2>
        <div className="py-8 px-4 text-center text-gray-500 rounded-xl border border-dashed border-gray-300">
          No applications are loaded. Applications submitted to your jobs appear here.
          If you expected a response, refresh this page to check again.
        </div>
      </section>
    )
  }

  const options = Array.from(new Map(applications.map((app) => [app.job_id, app])).values())
  // A server refresh can remove a previously selected option. Fall back to all.
  const selectedJob = options.some((app) => app.job_id === jobId) ? jobId : ''
  const filtered = selectedJob ? applications.filter((app) => app.job_id === selectedJob) : applications
  const visible = expanded ? filtered : filtered.slice(0, PREVIEW)

  return (
    <section id="applications" className="scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-3">
        <h2 className="text-xs font-bold tracking-widest text-gray-500 uppercase">
          Applications
          <span className="ml-2 text-gray-400 font-normal normal-case tracking-normal">
            ({totalApplications})
          </span>
        </h2>
        <p className="text-sm text-gray-500">
          Review responses and contact applicants directly.
        </p>
      </div>

      {options.length > 1 && (
        <div className="mb-4">
          <label htmlFor="application-job" className="block text-sm font-bold mb-2">Filter loaded applications by job</label>
          <select id="application-job" value={selectedJob} onChange={(event) => { setJobId(event.target.value); setExpanded(false) }} className="min-h-11 w-full min-w-0 max-w-lg rounded-md border border-gray-300 bg-white px-3 text-sm">
            <option value="">All jobs</option>
            {options.map((app) => <option key={app.job_id} value={app.job_id}>{app.job_title}{app.job_city || app.job_state ? ` (${[app.job_city, app.job_state].filter(Boolean).join(', ')})` : ''}</option>)}
          </select>
        </div>
      )}
      <p role="status" className="mb-3 text-sm text-gray-600">
        Showing {visible.length} of {filtered.length} loaded {selectedJob ? 'applications for this job' : 'applications'}.
      </p>
      {hasHiddenOlderApplications && (
        <p className="mb-3 text-sm text-amber-800">
          Only the {applications.length} most recent applications are loaded, out of {totalApplications} total.
          Older responses are not available on this screen. Check your saved application emails for older responses.
        </p>
      )}
      <div id="application-list" className="rounded-xl border border-gray-200 divide-y divide-gray-200">
        {visible.map((app) => (
          <ApplicationRow key={app.application_id} app={app} />
        ))}
      </div>

      {filtered.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls="application-list"
          className="mt-3 min-h-11 px-2 text-sm font-bold underline hover:text-[#17324D]"
        >
          {expanded
            ? 'Show fewer'
            : `Show all ${filtered.length} loaded applications`}
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
        <div className="col-span-12 md:col-span-4 min-w-0 break-words">
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
        <div className="col-span-12 md:col-span-4 min-w-0 text-sm space-y-0.5">
          <a
            href={`mailto:${app.email}`}
            className="flex min-h-11 items-center font-medium underline hover:text-[#17324D] break-all"
          >
            {app.email}
          </a>
          {app.phone && (
            <a
              href={`tel:${app.phone}`}
              className="flex min-h-11 items-center text-gray-600 hover:text-[#17324D] break-all"
            >
              {app.phone}
            </a>
          )}
        </div>

        {/* Job + date */}
        <div className="col-span-12 md:col-span-4 min-w-0 text-sm md:text-right">
          <Link
            href={`/jobs/${app.job_slug}`}
            className="block text-gray-700 hover:text-[#17324D] break-words"
            target="_blank"
            rel="noopener noreferrer"
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
              className="min-h-11 px-2 text-sm font-bold underline hover:text-[#17324D] mt-1"
            >
              {noteOpen ? 'Hide note' : 'Read cover note'}
            </button>
          )}
        </div>
      </div>

      {noteOpen && app.cover_note && (
        <div className="mt-3 border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
          {app.cover_note}
        </div>
      )}
    </div>
  )
}
