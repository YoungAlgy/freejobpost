'use client'

import { useEffect, useState } from 'react'

/**
 * Lightweight share affordance — copy-link + X / LinkedIn / Facebook intents,
 * plus the native share sheet on devices that support it. Pure distribution:
 * the page already ships OG/Twitter cards, so a shared link unfurls correctly.
 *
 * `url` is passed in absolute (computed server-side) to avoid a hydration
 * mismatch from reading window.location during render.
 */
type Props = {
  url: string
  title: string
  className?: string
}

export default function ShareButtons({ url, title, className = '' }: Props) {
  const [copied, setCopied] = useState(false)
  // navigator.share is device-dependent; detect after mount so server and first
  // client render agree (both render without the button, then it appears).
  const [canNativeShare, setCanNativeShare] = useState(false)
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const enc = encodeURIComponent
  const xHref = `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`
  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url })
    } catch {
      /* user cancelled or unsupported — no-op */
    }
  }

  const btn =
    'inline-flex items-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-bold tracking-wider uppercase hover:bg-black hover:text-white transition-colors'

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-bold tracking-wider uppercase text-gray-500 mr-1">Share</span>
      <button type="button" onClick={copy} className={btn} aria-label="Copy link to clipboard">
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
      <a href={xHref} target="_blank" rel="noopener noreferrer" className={btn}>
        X
      </a>
      <a href={liHref} target="_blank" rel="noopener noreferrer" className={btn}>
        LinkedIn
      </a>
      <a href={fbHref} target="_blank" rel="noopener noreferrer" className={btn}>
        Facebook
      </a>
      {canNativeShare && (
        <button type="button" onClick={nativeShare} className={btn} aria-label="Share via device">
          More…
        </button>
      )}
    </div>
  )
}
