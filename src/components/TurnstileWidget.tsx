'use client'

// Cloudflare Turnstile widget — drop into any form to gate submission on a
// human-or-bot challenge. Produces a token via onSuccess() that the form's
// server action must verify (see src/lib/turnstile.ts).
//
// THIS FILE IS MIRRORED ACROSS REPOS. Mirror any change to
// freeresumepost/src/components/TurnstileWidget.tsx in the same commit.
//
// Why a hand-rolled wrapper instead of a library (@marsidev/react-turnstile,
// next-turnstile, etc.): Turnstile's API is small (one script load + one
// render call + one callback) and we want zero npm-install surface for
// supply-chain reasons. ~80 lines of React vs an extra dependency tree.
//
// Failure mode: if NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, the widget
// renders nothing and immediately fires onSuccess('') so forms work in
// dev/preview environments without Turnstile provisioned. Server-side
// verification mirrors this fail-open behavior.

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        opts: {
          sitekey: string
          callback?: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          appearance?: 'always' | 'execute' | 'interaction-only'
          action?: string
        }
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
      ready: (cb: () => void) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Resolves when window.turnstile is fully ready to render. Handles both the
 * "script already loaded" case and the fresh-load case. The script's `load`
 * event fires before turnstile's internal init completes, so we use
 * window.turnstile.ready() — Cloudflare's documented "actually ready" hook.
 */
function whenTurnstileReady(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onReady = () => {
      if (window.turnstile && typeof window.turnstile.ready === 'function') {
        window.turnstile.ready(() => resolve())
      } else {
        // Defensive fallback — if ready() is missing, just resolve and let
        // the render() call fail loudly.
        resolve()
      }
    }
    if (window.turnstile) {
      onReady()
      return
    }
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', onReady, { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true })
      // The script may already be loaded but we can't tell; retry briefly.
      const start = Date.now()
      const tick = () => {
        if (window.turnstile) onReady()
        else if (Date.now() - start < 5000) setTimeout(tick, 100)
      }
      tick()
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = onReady
    s.onerror = () => reject(new Error('Turnstile script failed to load'))
    document.head.appendChild(s)
  })
}

type Props = {
  /** Called when the user passes the challenge. Receives the verification token. */
  onSuccess: (token: string) => void
  /** Called if the challenge errors out. Optional. */
  onError?: () => void
  /** Called if a previously-issued token expires (after 5 min). */
  onExpired?: () => void
  /** Optional action label — passed back in siteverify response for analytics. */
  action?: string
  /** Render mode: 'always' shows the widget, 'interaction-only' only on challenge */
  appearance?: 'always' | 'interaction-only'
  /** Visual theme. Defaults to auto (matches user's system). */
  theme?: 'light' | 'dark' | 'auto'
  /** Optional className for the wrapper div */
  className?: string
}

export default function TurnstileWidget({
  onSuccess,
  onError,
  onExpired,
  action,
  appearance = 'always',
  theme = 'auto',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!sitekey) {
      // Not configured — fail open so forms still work.
      onSuccess('')
      return
    }
    let cancelled = false
    whenTurnstileReady()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        // If a widget was already rendered in this container (e.g. due to
        // React Strict Mode double-invoke in dev), remove it first.
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current)
          } catch { /* widget may already be gone */ }
          widgetIdRef.current = null
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: onSuccess,
          'error-callback': onError,
          'expired-callback': onExpired,
          theme,
          appearance,
          action,
        })
      })
      .catch((err) => {
        console.error('Turnstile load failed:', err.message)
        // Fail open — script blocked by ad-blocker, network issue, etc.
        onSuccess('')
      })
    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          /* noop */
        }
        widgetIdRef.current = null
      }
    }
    // We intentionally re-mount when callbacks change to keep them fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If no sitekey, render nothing visible — the useEffect above will have
  // already fired onSuccess('') so the form treats it as ready.
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return null
  }

  return <div ref={containerRef} className={className} />
}
