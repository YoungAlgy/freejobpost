'use client'

import { useState, useTransition } from 'react'
import { requestLoginLink } from './actions'
import TurnstileWidget from '@/components/TurnstileWidget'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [pending, startTransition] = useTransition()
  // Cloudflare Turnstile token — see TurnstileWidget.tsx. null until challenge passes.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  // Incrementing key forces TurnstileWidget to remount after a failed submit.
  const [turnstileKey, setTurnstileKey] = useState(0)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await requestLoginLink(null, { email }, turnstileToken ?? '')
      setResult(r)
      if (!r.success) {
        setTurnstileToken(null)
        setTurnstileKey((k) => k + 1)
      }
    })
  }

  if (result?.success) {
    return (
      <div role="status" aria-live="polite" className="border-2 border-black p-6 bg-green-50">
        <p className="font-black text-lg mb-2">Check your email.</p>
        <p className="text-sm text-gray-800">
          If <strong>{email}</strong> has posts on freejobpost.co, you&apos;ll
          receive a sign-in link in the next minute. Click it from any device
          to open your dashboard.
        </p>
        <p className="text-xs text-gray-500 mt-4">
          Don&apos;t see it? Check your spam folder. Link stays active for 30 days.
          Still nothing after a few minutes?{' '}
          <a href="mailto:alex@avahealth.co?subject=Employer+dashboard+login+help" className="underline hover:text-green-700">
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
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          placeholder="you@yourhealthclinic.com"
          className="w-full px-4 py-3 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
      </label>

      <TurnstileWidget
        key={turnstileKey}
        onSuccess={setTurnstileToken}
        onError={() => setTurnstileToken(null)}
        onExpired={() => setTurnstileToken(null)}
        action="employer-login"
      />

      {result && !result.success && (
        <div role="alert" className="border-2 border-red-600 bg-red-50 p-3 text-red-800 text-sm font-medium">
          {result.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send sign-in link →'}
      </button>
    </form>
  )
}
