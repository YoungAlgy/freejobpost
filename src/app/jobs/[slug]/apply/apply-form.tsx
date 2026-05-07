'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { submitApplication, type ApplyInput, type ApplyResult } from './actions'
import TurnstileWidget from '@/components/TurnstileWidget'

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
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [pending, startTransition] = useTransition()
  // Cloudflare Turnstile token — see TurnstileWidget.tsx. null until challenge passes.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  function canSubmit(): boolean {
    return (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) &&
      values.first_name.trim().length > 0 &&
      values.last_name.trim().length > 0
    )
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit()) return
    startTransition(async () => {
      const r = await submitApplication(null, values, turnstileToken ?? '')
      setResult(r)
      if (r.success) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  if (result?.success) {
    return (
      <div className="border-2 border-black p-8 bg-green-50">
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-xs font-bold tracking-wider mb-4">
          <span className="w-2 h-2 bg-green-600" />
          APPLIED
        </div>
        <h2 className="text-2xl md:text-3xl font-black leading-tight mb-3">
          Your application is in.
        </h2>
        <p className="text-gray-800 mb-4">
          We sent it to the employer. They will reach out directly to{' '}
          <strong>{values.email}</strong>
          {values.phone ? (
            <>
              {' '}or <strong>{values.phone}</strong>
            </>
          ) : null}{' '}
          if they want to move forward.
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Most healthcare employers respond within a few days. Keep applying to
          other roles in the meantime.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
          >
            Browse more jobs →
          </Link>
          <a
            href="https://www.freeresumepost.co/upload"
            className="inline-flex items-center justify-center border-2 border-black px-6 py-3 font-bold hover:bg-black hover:text-white transition-colors"
          >
            Upload your resume
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="First name" required>
          <input
            type="text"
            required
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
          value={values.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
          maxLength={254}
          className={fieldStyle}
        />
      </Field>

      <Field label="Phone" hint="Optional">
        <input
          type="tel"
          value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })}
          maxLength={30}
          className={fieldStyle}
        />
      </Field>

      <Field label="Resume URL" hint="Optional · link to your PDF on Dropbox, Drive, etc.">
        <input
          type="url"
          value={values.resume_url}
          onChange={(e) => setValues({ ...values, resume_url: e.target.value })}
          maxLength={500}
          placeholder="https://..."
          className={fieldStyle}
        />
        <p className="text-xs text-gray-500 mt-1">
          Or{' '}
          <a
            href="https://www.freeresumepost.co/upload"
            className="underline hover:text-green-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            upload to freeresumepost.co
          </a>{' '}
          for a public profile URL.
        </p>
      </Field>

      <Field label="Short note to the employer" hint="Optional · why you are a fit">
        <textarea
          value={values.cover_note}
          onChange={(e) => setValues({ ...values, cover_note: e.target.value })}
          rows={5}
          maxLength={2000}
          placeholder="A few sentences about your experience, availability, or what caught your eye about the role."
          className={`${fieldStyle} font-mono text-sm`}
        />
        <p className="text-xs text-gray-500 mt-1">{values.cover_note.length} / 2,000</p>
      </Field>

      <TurnstileWidget
        onSuccess={setTurnstileToken}
        onError={() => setTurnstileToken(null)}
        onExpired={() => setTurnstileToken(null)}
        action="apply-to-job"
      />

      {result && !result.success && (
        <div className="border-2 border-red-600 bg-red-50 p-4 text-red-800 font-medium">
          {result.error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t-2 border-black">
        <Link
          href={`/jobs/${jobSlug}`}
          className="text-sm font-bold underline hover:text-green-700"
        >
          ← Back to {jobTitle.length > 30 ? 'job' : jobTitle}
        </Link>
        <button
          type="submit"
          disabled={pending || !canSubmit()}
          className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Submitting…' : 'Apply →'}
        </button>
      </div>
    </form>
  )
}

const fieldStyle =
  'w-full px-4 py-3 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-green-600'

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
      <div className="flex items-baseline justify-between mb-1.5">
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
