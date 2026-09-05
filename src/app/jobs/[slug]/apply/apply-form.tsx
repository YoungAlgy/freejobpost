'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { submitApplication, type ApplyInput } from './actions'
import TurnstileWidget from '@/components/TurnstileWidget'
import { isTurnstileReady, turnstileResultStatus, type TurnstileStatus } from '@/lib/form-verification'
import { settleApplication, type ApplicationResult } from '@/lib/application-result'
import { sanitizeResumeUrl } from '@/lib/sanitize-resume-url'

type Props = {
  jobId: string
  jobSlug: string
  jobTitle: string
}

export default function ApplyForm({ jobId, jobSlug, jobTitle }: Props) {
  const [values, setValues] = useState<ApplyInput>({
    job_id: jobId,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    cover_note: '',
    resume_url: '',
  })
  const [result, setResult] = useState<ApplicationResult | null>(null)
  const [submittedContact, setSubmittedContact] = useState({ email: '', phone: '' })
  const [pending, startTransition] = useTransition()
  const submissionRef = useRef(false)
  const mountedRef = useRef(true)
  const verificationConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [verificationStatus, setVerificationStatus] = useState<TurnstileStatus>('pending')
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  // Cloudflare Turnstile token — see TurnstileWidget.tsx. null until challenge passes.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Incrementing key forces TurnstileWidget to remount after a failed submit
  // so the user gets a fresh challenge (Turnstile tokens are single-use).
  const [turnstileKey, setTurnstileKey] = useState(0)
  const verificationReady = isTurnstileReady(verificationConfigured, turnstileToken)
  const resumeLinkValid = !values.resume_url.trim() || sanitizeResumeUrl(values.resume_url) !== null

  function retryVerification() {
    if (submissionRef.current || pending) return
    setTurnstileToken(null)
    setVerificationStatus('pending')
    setTurnstileKey((key) => key + 1)
  }

  function canSubmit(): boolean {
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) &&
      values.first_name.trim().length > 0 &&
      values.last_name.trim().length > 0 && resumeLinkValid
    )
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submissionRef.current || pending || !canSubmit() || !verificationReady) return
    submissionRef.current = true
    const submitted = { ...values, job_id: jobId }
    setSubmittedContact({ email: submitted.email.trim().toLowerCase(), phone: submitted.phone })
    setResult(null)
    startTransition(async () => {
      try {
        const settled = await settleApplication(() => submitApplication(null, submitted, turnstileToken ?? ''))
        if (!mountedRef.current) return
        setResult(settled)
        if (settled.state === 'submitted') {
          window.scrollTo({ top: 0, behavior: 'auto' })
        } else {
          // A rejected or unconfirmed attempt can have consumed the token.
          setTurnstileToken(null)
          setVerificationStatus('pending')
          setTurnstileKey((key) => key + 1)
        }
      } finally {
        submissionRef.current = false
      }
    })
  }

  if (result?.state === 'submitted') {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-gray-200 shadow-sm p-5 sm:p-8 bg-green-50">
        <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1 text-xs font-bold tracking-wider mb-4">
          <span className="w-2 h-2 bg-[#276749]" />
          APPLIED
        </div>
        <h2 className="text-2xl md:text-3xl font-black leading-tight mb-3">
          Your application is saved.
        </h2>
        <p className="text-gray-800 mb-4">
          The employer can review your application and contact you at{' '}
          <strong className="break-all">{submittedContact.email}</strong>
          {submittedContact.phone ? (
            <>
              {' '}or <strong className="break-all">{submittedContact.phone}</strong>
            </>
          ) : null}{' '}
          if they want to move forward.
        </p>
        {!result.notificationReported && (
          <p className="text-sm text-gray-600 mb-4">Email notification is not confirmed. Your application is saved, so you do not need to send it again.</p>
        )}
        <p className="text-sm text-gray-600 mb-6">Response times vary by employer. You can keep browsing other jobs.</p>
        <div>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center bg-[#276749] text-white px-6 py-3 font-bold rounded-lg hover:bg-[#1F563B] transition-colors"
          >
            Browse more jobs →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <legend className="sr-only">Your application details</legend>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="First name" required>
            <input
              type="text"
              required
              autoComplete="given-name"
              value={values.first_name}
              onChange={(e) => setValues({ ...values, first_name: e.target.value })}
              maxLength={100}
              className={fieldStyle}
            />
          </Field>
          <Field label="Last name" required>
            <input
              type="text"
              required
              autoComplete="family-name"
              value={values.last_name}
              onChange={(e) => setValues({ ...values, last_name: e.target.value })}
              maxLength={100}
              className={fieldStyle}
            />
          </Field>
        </div>

        <Field label="Email" required hint="How the employer reaches you">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            maxLength={254}
            className={fieldStyle}
          />
        </Field>

        <Field label="Phone" hint="Optional">
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => setValues({ ...values, phone: e.target.value })}
            maxLength={30}
            className={fieldStyle}
          />
        </Field>

        <Field label="Resume link" hint="Optional">
          <input
            type="url"
            autoComplete="url"
            inputMode="url"
            value={values.resume_url}
            onChange={(e) => setValues({ ...values, resume_url: e.target.value })}
            maxLength={500}
            aria-invalid={!resumeLinkValid}
            aria-describedby={resumeLinkValid ? 'resume-link-help' : 'resume-link-help resume-link-error'}
            placeholder="https://..."
            className={fieldStyle}
          />
          <p id="resume-link-help" className="text-xs text-gray-500 mt-1">Use a secure link to a resume the employer can open. Your FreeResumePost profile is not attached automatically.</p>
          {!resumeLinkValid && <p id="resume-link-error" className="text-sm text-red-700 mt-1">Enter an http:// or https:// link without a username or password, or leave this blank.</p>}
        </Field>

        <Field label="Short note to the employer" hint="Optional · why you are a fit">
          <textarea
            value={values.cover_note}
            onChange={(e) => setValues({ ...values, cover_note: e.target.value })}
            rows={5}
            maxLength={2000}
            aria-describedby="cover-note-count"
            placeholder="A few sentences about your experience, availability, or what caught your eye about the role."
            className={`${fieldStyle} text-sm`}
          />
          <p id="cover-note-count" aria-live="polite" className="text-xs text-gray-500 mt-1">{values.cover_note.length} / 2,000</p>
        </Field>
      </fieldset>

      <TurnstileWidget
        key={turnstileKey}
        onSuccess={(token) => {
          const status = turnstileResultStatus(verificationConfigured, token)
          setTurnstileToken(status === 'ready' ? token : null)
          setVerificationStatus(status)
        }}
        onError={() => {
          setTurnstileToken(null)
          setVerificationStatus('failed')
        }}
        onExpired={() => {
          setTurnstileToken(null)
          setVerificationStatus('expired')
        }}
        action="apply-to-job"
      />

      {verificationConfigured && !verificationReady && (
        <div className="space-y-2 text-sm text-gray-700">
          <p role="status" aria-live="polite">
            {verificationStatus === 'failed'
              ? 'Verification could not load. Retry to continue.'
              : verificationStatus === 'expired'
                ? 'Verification expired. Retry to continue.'
                : 'Complete the verification before sending your application.'}
          </p>
          {(verificationStatus === 'failed' || verificationStatus === 'expired') && (
            <button type="button" onClick={retryVerification} disabled={pending} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-gray-50 disabled:opacity-50">Retry verification</button>
          )}
        </div>
      )}

      {result && (
        <div role="alert" className="border-2 border-red-600 bg-red-50 p-4 text-red-800 font-medium">
          {result.error}
        </div>
      )}

      <p className="text-sm text-gray-600">Sending this application shares the details you enter with the employer for this job.</p>
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-gray-200">
        <Link
          href={`/jobs/${jobSlug}`}
          className="inline-flex min-h-11 items-center text-sm font-bold underline hover:text-[#17324D] break-words"
        >
          ← Back to {jobTitle.length > 30 ? 'job' : jobTitle}
        </Link>
        <button
          type="submit"
          disabled={pending || !canSubmit() || !verificationReady}
          className="inline-flex min-h-11 items-center justify-center bg-[#276749] text-white px-6 py-3 font-bold rounded-lg hover:bg-[#1F563B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Sending application...' : result?.state === 'unknown' ? 'Try sending again' : 'Send application'}
        </button>
      </div>
    </form>
  )
}

const fieldStyle =
  'w-full px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-[#276749]'

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
        <span className="text-xs font-bold tracking-wider uppercase">
          {label}
          {required && <span className="text-red-600 ml-1">*</span>}
        </span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
