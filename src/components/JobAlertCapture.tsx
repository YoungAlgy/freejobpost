'use client'

import { useState, useTransition } from 'react'
import { subscribeJobAlert, type JobAlertResult } from '@/lib/actions/job-alert'
import TurnstileWidget from '@/components/TurnstileWidget'

/**
 * Low-friction email capture: "get new <specialty> jobs in <state> by email".
 *
 * This is the board→CRM lead-capture for the *passive majority* — visitors who
 * won't apply/post/upload on a first visit but will leave an email for relevant
 * job alerts. Each subscribe becomes a re-contactable CRM lead tagged with
 * specialty + state intent (the moat), so paid/organic traffic converts into a
 * durable lead asset instead of bouncing.
 *
 * Mirrors the apply/post/upload pattern: Cloudflare Turnstile (fail-open if
 * unconfigured) + a SECURITY DEFINER RPC write. specialty/state/city are
 * prefilled from page context (a specialty/state/city hub or a job page) so the
 * form stays a single email field — the lowest-friction conversion on the site.
 */
type Props = {
  /** Prefilled from page context; drives both the copy and the stored intent. */
  defaultSpecialty?: string
  defaultState?: string
  defaultCity?: string
  /** Where this widget is mounted, for attribution (e.g. 'specialty_hub', 'job_page', 'home'). */
  source: string
  className?: string
}

export default function JobAlertCapture({
  defaultSpecialty,
  defaultState,
  defaultCity,
  source,
  className = '',
}: Props) {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<JobAlertResult | null>(null)
  const [pending, startTransition] = useTransition()
  // Cloudflare Turnstile token — see TurnstileWidget.tsx. null until challenge passes.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Incrementing key remounts TurnstileWidget after a failed submit (tokens are single-use).
  const [turnstileKey, setTurnstileKey] = useState(0)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  // Human-readable "what you'll get" line, built from page context.
  const locationPart = defaultCity
    ? ` in ${defaultCity}`
    : defaultState
      ? ` in ${defaultState}`
      : ''
  const what = `${defaultSpecialty ? defaultSpecialty : 'healthcare'} jobs${locationPart}`

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!emailValid) return
    startTransition(async () => {
      const r = await subscribeJobAlert(
        {
          email,
          specialty: defaultSpecialty ?? null,
          state: defaultState ?? null,
          city: defaultCity ?? null,
          source,
        },
        turnstileToken ?? '',
      )
      setResult(r)
      if (!r.success) {
        // Token is single-use — reset so retry requires a fresh challenge.
        setTurnstileToken(null)
        setTurnstileKey((k) => k + 1)
      }
    })
  }

  if (result?.success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`border-2 border-black bg-green-50 p-5 ${className}`}
      >
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-xs font-bold tracking-wider mb-2">
          <span className="w-2 h-2 bg-green-600" />
          SUBSCRIBED
        </div>
        <p className="font-black text-lg leading-tight">You&rsquo;re on the list.</p>
        <p className="text-sm text-gray-700 mt-1">
          We&rsquo;ll email <strong>{email}</strong> when new {what} get posted. Unsubscribe
          anytime with one click, no questions.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={`border-2 border-black p-5 ${className}`}>
      <h3 className="text-lg font-black leading-tight mb-1">Get new {what} by email</h3>
      <p className="text-sm text-gray-600 mb-4">
        Free job alerts. New matching roles straight to your inbox. No spam, unsubscribe anytime.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          aria-label="Your email address"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          className="flex-1 px-4 py-3 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <button
          type="submit"
          disabled={pending || !emailValid}
          className="inline-flex items-center justify-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {pending ? 'Subscribing…' : 'Email me jobs →'}
        </button>
      </div>

      <div className="mt-3">
        <TurnstileWidget
          key={turnstileKey}
          onSuccess={setTurnstileToken}
          onError={() => setTurnstileToken(null)}
          onExpired={() => setTurnstileToken(null)}
          action="job-alert-subscribe"
        />
      </div>

      {result && !result.success && (
        <div
          role="alert"
          className="mt-3 border-2 border-red-600 bg-red-50 p-3 text-red-800 text-sm font-medium"
        >
          {result.error}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        By subscribing you agree to receive job-alert emails from freejobpost.co. Unsubscribe
        anytime.{' '}
        <a href="/privacy" className="underline hover:text-green-700">
          Privacy
        </a>
        .
      </p>
    </form>
  )
}
