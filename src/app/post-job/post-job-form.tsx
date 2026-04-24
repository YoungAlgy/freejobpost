'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { submitPostJob, type PostJobInput, type PostJobResult } from './actions'

// US state list for the state dropdown. Mirrors the 2-letter format enforced by
// submit_public_job_rpc.
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]

const INITIAL: PostJobInput = {
  contact_email: '',
  contact_name: '',
  company_name: '',
  company_url: '',
  title: '',
  description: '',
  role: '',
  specialty: '',
  city: '',
  state: '',
  remote_hybrid: 'onsite',
  employment_type: 'full_time',
  salary_min: null,
  salary_max: null,
  experience_required: '',
  apply_url: '',
}

export default function PostJobForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [values, setValues] = useState<PostJobInput>(INITIAL)
  const [result, setResult] = useState<PostJobResult | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const update = <K extends keyof PostJobInput>(key: K, v: PostJobInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  const canAdvanceStep1 = values.title.trim().length >= 3 && values.role.trim().length > 0
  const canAdvanceStep2 =
    values.description.trim().length >= 30 &&
    (values.remote_hybrid === 'remote' || values.state.length === 2)
  const canSubmit = values.company_name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)

  const onSubmit = () => {
    setStepError(null)
    startTransition(async () => {
      const r = await submitPostJob(null, values)
      setResult(r)
    })
  }

  // Success screen
  if (result?.success) {
    return (
      <div className="border-2 border-black p-8 md:p-10 bg-green-50">
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-xs font-bold tracking-wider mb-6">
          <span className="w-2 h-2 bg-green-600" />
          SUBMITTED
        </div>
        <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4">
          Check your email.
        </h2>
        <p className="text-lg text-gray-800 mb-6">
          We sent a one-click verification link to{' '}
          <strong className="font-bold">{values.contact_email}</strong>. The moment you
          click it, your job goes live at{' '}
          <code className="bg-white px-1.5 py-0.5 text-sm font-mono">
            /jobs/{result.job_slug}
          </code>
          .
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Link expires in 48 hours. Check your spam folder if you don&apos;t see it in a few minutes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/jobs"
            className="inline-flex items-center border-2 border-black px-6 py-3 font-bold hover:bg-black hover:text-white transition-colors"
          >
            Browse live jobs
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null)
              setStep(1)
              setValues(INITIAL)
            }}
            className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
          >
            Post another →
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (step === 1) {
          if (canAdvanceStep1) setStep(2)
          else setStepError('Fill in the role and title to continue.')
        } else if (step === 2) {
          if (canAdvanceStep2) setStep(3)
          else
            setStepError(
              values.description.trim().length < 30
                ? 'Description should be at least 30 characters.'
                : 'Pick a state (or mark the role as remote).'
            )
        } else if (step === 3) {
          if (canSubmit) onSubmit()
          else setStepError('Double-check your company name and email.')
        }
      }}
      className="space-y-6"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-bold tracking-wider mb-6">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex items-center gap-2 ${
              s === step ? 'text-black' : s < step ? 'text-green-700' : 'text-gray-400'
            }`}
          >
            <span
              className={`w-7 h-7 border-2 flex items-center justify-center ${
                s === step
                  ? 'border-black bg-black text-white'
                  : s < step
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-gray-300'
              }`}
            >
              {s}
            </span>
            <span className="hidden md:inline uppercase">
              {s === 1 ? 'Role' : s === 2 ? 'Details' : 'Contact'}
            </span>
            {s < 3 && <span className="w-8 border-t-2 border-gray-300" />}
          </div>
        ))}
      </div>

      {result && !result.success && (
        <div className="border-2 border-red-600 bg-red-50 p-4 text-red-800 font-medium">
          {result.error}
        </div>
      )}

      {step === 1 && (
        <>
          <Field label="Job title" required>
            <input
              type="text"
              value={values.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="e.g. Family Medicine Physician — Tampa, FL"
              maxLength={200}
              className={fieldStyle}
            />
          </Field>
          <Field label="Role category" required>
            <input
              type="text"
              value={values.role}
              onChange={(e) => update('role', e.target.value)}
              placeholder="Physician, RN, Therapist, Medical Assistant…"
              maxLength={100}
              className={fieldStyle}
            />
          </Field>
          <Field label="Specialty (optional)">
            <input
              type="text"
              value={values.specialty}
              onChange={(e) => update('specialty', e.target.value)}
              placeholder="Family Medicine, ICU, Telehealth Psych…"
              maxLength={100}
              className={fieldStyle}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Description" required>
            <textarea
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="What's the role? Key responsibilities, team, schedule, what makes this a good opportunity. 30+ characters."
              rows={8}
              maxLength={10000}
              className={`${fieldStyle} font-mono text-sm`}
            />
            <p className="text-xs text-gray-500 mt-1">
              {values.description.length} / 10,000 · Markdown supported
            </p>
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="City">
              <input
                type="text"
                value={values.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="Tampa"
                maxLength={100}
                className={fieldStyle}
              />
            </Field>
            <Field
              label="State"
              required={values.remote_hybrid !== 'remote'}
              hint={values.remote_hybrid === 'remote' ? 'Optional for remote roles' : '2-letter code'}
            >
              <select
                value={values.state}
                onChange={(e) => update('state', e.target.value)}
                className={fieldStyle}
              >
                <option value="">—</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Location">
              <select
                value={values.remote_hybrid}
                onChange={(e) => update('remote_hybrid', e.target.value as PostJobInput['remote_hybrid'])}
                className={fieldStyle}
              >
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </select>
            </Field>
            <Field label="Employment type">
              <select
                value={values.employment_type}
                onChange={(e) => update('employment_type', e.target.value as PostJobInput['employment_type'])}
                className={fieldStyle}
              >
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="locum">Locum</option>
                <option value="per_diem">Per diem</option>
                <option value="internship">Internship</option>
              </select>
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Salary min (USD/yr)">
              <input
                type="number"
                min={0}
                max={10000000}
                step={1000}
                value={values.salary_min ?? ''}
                onChange={(e) => update('salary_min', e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="180000"
                className={fieldStyle}
              />
            </Field>
            <Field label="Salary max (USD/yr)">
              <input
                type="number"
                min={0}
                max={10000000}
                step={1000}
                value={values.salary_max ?? ''}
                onChange={(e) => update('salary_max', e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="240000"
                className={fieldStyle}
              />
            </Field>
          </div>
          <Field label="Experience required (optional)">
            <input
              type="text"
              value={values.experience_required}
              onChange={(e) => update('experience_required', e.target.value)}
              placeholder="3+ years outpatient family practice"
              maxLength={200}
              className={fieldStyle}
            />
          </Field>
          <Field label="External apply URL (optional)" hint="If you have your own apply flow">
            <input
              type="url"
              value={values.apply_url}
              onChange={(e) => update('apply_url', e.target.value)}
              placeholder="https://careers.yourcompany.com/apply/abc123"
              maxLength={500}
              className={fieldStyle}
            />
          </Field>
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Company name" required>
            <input
              type="text"
              value={values.company_name}
              onChange={(e) => update('company_name', e.target.value)}
              placeholder="Sunshine Medical Group"
              maxLength={200}
              className={fieldStyle}
            />
          </Field>
          <Field label="Company website (optional)">
            <input
              type="url"
              value={values.company_url}
              onChange={(e) => update('company_url', e.target.value)}
              placeholder="https://sunshinemedical.com"
              maxLength={300}
              className={fieldStyle}
            />
          </Field>
          <Field label="Your name" hint="Who we email the verify link to">
            <input
              type="text"
              value={values.contact_name}
              onChange={(e) => update('contact_name', e.target.value)}
              placeholder="Dr. Maya Chen"
              maxLength={100}
              className={fieldStyle}
            />
          </Field>
          <Field label="Your email" required hint="We'll send you a one-click verify link">
            <input
              type="email"
              value={values.contact_email}
              onChange={(e) => update('contact_email', e.target.value)}
              placeholder="maya@sunshinemedical.com"
              maxLength={254}
              className={fieldStyle}
            />
          </Field>
          <p className="text-xs text-gray-500">
            By submitting, you agree your job posting can appear on freejobpost.co.
            We&apos;ll never sell your contact info.
          </p>
        </>
      )}

      {stepError && <p className="text-sm font-bold text-red-600">{stepError}</p>}

      {/* Nav buttons */}
      <div className="flex items-center justify-between pt-4 border-t-2 border-black">
        <div>
          {step > 1 && (
            <button
              type="button"
              onClick={() => {
                setStep((step - 1) as 1 | 2 | 3)
                setStepError(null)
              }}
              className="text-sm font-bold underline hover:text-green-700"
            >
              ← Back
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? 'Submitting…'
            : step === 3
            ? 'Submit & email verify link →'
            : 'Continue →'}
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
