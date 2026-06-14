'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { unsubscribeJobAlert } from '@/lib/actions/job-alert'

// Confirm-button (not auto-on-load) on purpose: email clients prefetch links,
// which would auto-unsubscribe people who never clicked. A click is required.
export default function UnsubscribeClient() {
  const token = useSearchParams().get('token') ?? ''
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const valid = /^[0-9a-fA-F-]{36}$/.test(token)

  function onConfirm() {
    startTransition(async () => {
      // 2026-06 audit (F96): the old version confirmed unconditionally, so an
      // RPC failure showed "You're unsubscribed" while the emails kept coming.
      const res = await unsubscribeJobAlert(token)
      if (res.success) {
        setDone(true)
        setFailed(false)
      } else {
        setFailed(true)
      }
    })
  }

  if (!valid) {
    return (
      <div className="border-2 border-black p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-black mb-2">Invalid unsubscribe link</h1>
        <p className="text-gray-700 mb-6">
          This link is missing or malformed. If you keep getting alerts you don't want, reply
          to any alert email and we'll remove you.
        </p>
        <Link
          href="/jobs"
          className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
        >
          Browse jobs →
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="border-2 border-black bg-green-50 p-8 max-w-md w-full text-center">
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-xs font-bold tracking-wider mb-4">
          <span className="w-2 h-2 bg-green-600" />
          UNSUBSCRIBED
        </div>
        <h1 className="text-2xl font-black mb-2">You're unsubscribed.</h1>
        <p className="text-gray-700 mb-6">
          You won't get any more job-alert emails. Changed your mind? You can re-subscribe from
          any specialty or city page.
        </p>
        <Link
          href="/jobs"
          className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
        >
          Browse jobs →
        </Link>
      </div>
    )
  }

  return (
    <div className="border-2 border-black p-8 max-w-md w-full text-center">
      <h1 className="text-2xl font-black mb-2">Unsubscribe from job alerts?</h1>
      <p className="text-gray-700 mb-6">
        Click below to stop receiving job-alert emails from freejobpost.co.
      </p>
      {failed && (
        <p className="border-2 border-red-600 bg-red-50 text-red-700 text-sm font-medium p-3 mb-4">
          That didn't go through. Try again in a minute, or reply to any alert
          email and we'll remove you by hand.
        </p>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Unsubscribing…' : 'Unsubscribe me'}
      </button>
    </div>
  )
}
