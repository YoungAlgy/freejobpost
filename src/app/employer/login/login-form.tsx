'use client'

import { useRef, useState, useTransition } from 'react'
import { requestLoginLink } from './actions'
import TurnstileWidget from '@/components/TurnstileWidget'
import { FREEJOBPOST_SUPPORT_EMAIL } from '@/lib/freejobpost-email'
import { settleEmployerLogin } from '@/lib/employer-login-result'
import { isTurnstileReady, turnstileResultStatus, type TurnstileStatus } from '@/lib/form-verification'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const submissionRef = useRef(false)
  const verificationConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [verificationStatus, setVerificationStatus] = useState<TurnstileStatus>('pending')
  // Cloudflare Turnstile token — see TurnstileWidget.tsx. null until challenge passes.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Incrementing key forces TurnstileWidget to remount after a failed submit.
  const [turnstileKey, setTurnstileKey] = useState(0)
  const verificationReady = isTurnstileReady(verificationConfigured, turnstileToken)

  function retryVerification() {
    if (submissionRef.current || pending) return
    setTurnstileToken(null)
    setVerificationStatus('pending')
    setTurnstileKey((k) => k + 1)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submissionRef.current || pending || !verificationReady) return
    submissionRef.current = true
    setResult(null)
    startTransition(async () => {
      try {
        const r = await settleEmployerLogin(
          () => requestLoginLink(null, { email }, turnstileToken ?? ''),
        )
        setResult(r)
        if (!r.success) {
          setTurnstileToken(null)
          setVerificationStatus('pending')
          setTurnstileKey((k) => k + 1)
        }
      } finally {
        submissionRef.current = false
      }
    })
  }

  if (result?.success) {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-gray-200 shadow-sm p-6 bg-green-50">
        <p className="font-black text-lg mb-2">Check your email.</p>
        <p className="text-sm text-gray-800">
          If <strong className="break-all">{email}</strong> has posts on freejobpost.co, you&apos;ll
          receive a sign-in link. Open it to view your dashboard.
        </p>
        <p className="text-xs text-gray-500 mt-4">
          Don&apos;t see it? Check your spam folder. Link stays active for 30 days.
          Still nothing after a few minutes?{' '}
          <a href={`mailto:${FREEJOBPOST_SUPPORT_EMAIL}?subject=Employer+dashboard+login+help`} className="underline hover:text-[#17324D]">
            Email us
          </a>{' '}
          and we&apos;ll sort it out.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs font-bold tracking-wider uppercase block mb-1.5">
          Email
        </span>
        <input
          type="email"
          disabled={pending}
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          placeholder="you@yourhealthclinic.com"
          className="w-full px-4 py-3 bg-white rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#276749]"
        />
      </label>

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
        action="employer-login"
      />

      {verificationConfigured && !verificationReady && (
        <div className="space-y-2 text-sm text-gray-700">
          <p role="status" aria-live="polite">
            {verificationStatus === 'failed'
              ? 'Verification could not load. Retry to continue.'
              : verificationStatus === 'expired'
                ? 'Verification expired. Retry to continue.'
                : 'Complete the verification to send your sign-in link.'}
          </p>
          {(verificationStatus === 'failed' || verificationStatus === 'expired') && (
            <button
              type="button"
              onClick={retryVerification}
              disabled={pending}
              className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Retry verification
            </button>
          )}
        </div>
      )}

      {result && !result.success && (
        <div role="alert" className="border-2 border-red-600 bg-red-50 p-3 text-red-800 text-sm font-medium">
          {result.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !verificationReady}
        className="w-full bg-[#276749] text-white px-6 py-3 font-bold rounded-lg hover:bg-[#1F563B] transition-colors disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send sign-in link →'}
      </button>
    </form>
  )
}
