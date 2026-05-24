'use client'

// Route-segment error boundary. Catches uncaught errors thrown by Server
// Components, async data fetches, etc. within ANY route below /. Without
// this file Next.js falls back to its generic dev/prod error UI which
// looks broken to users.
//
// The `reset` callback re-renders the segment from scratch — useful for
// transient failures (e.g. a Supabase timeout where a retry would succeed).
//
// Hard rule per Next.js docs: must be a Client Component (`'use client'`)
// because `reset` is a function passed across the boundary. The file
// cannot export metadata.

import Link from 'next/link'
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The `digest` is the hashed server-error id Next.js exposes when a
    // Server Component throws — useful in logs because the original
    // stack is stripped from the client. console.error pipes to Vercel
    // logs in prod + browser devtools in dev.
    console.error('Route segment error:', { message: error.message, digest: error.digest })
  }, [error])

  return (
    <main className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h1 className="text-6xl font-black tracking-tight mb-4">Whoops</h1>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        Something went wrong on our end
      </h2>
      <p className="text-gray-600 mb-2 max-w-md mx-auto">
        This is on us, not you. Most of the time, a quick retry fixes it.
      </p>
      {error.digest ? (
        <p className="text-xs text-gray-400 mb-10 font-mono">
          Error id: {error.digest}
        </p>
      ) : (
        <p className="mb-10" />
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex justify-center items-center bg-green-600 text-black px-6 py-3 font-black border-2 border-black hover:bg-green-500 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/jobs"
          className="inline-flex justify-center items-center bg-white text-black px-6 py-3 font-bold border-2 border-black hover:bg-black hover:text-white transition-colors"
        >
          Browse all jobs
        </Link>
        <Link
          href="/"
          className="inline-flex justify-center items-center text-gray-700 px-6 py-3 font-bold hover:underline"
        >
          Home
        </Link>
      </div>

      <div className="text-left border-2 border-black bg-gray-50 p-6">
        <h3 className="text-xs font-black tracking-wider uppercase mb-4">
          If it keeps happening
        </h3>
        <p className="text-sm text-gray-700">
          Email{' '}
          <a href="mailto:info@avahealth.co" className="underline font-bold hover:text-green-700">
            info@avahealth.co
          </a>{' '}
          and include the error id above (if shown). We respond within 24
          hours during the weekday — usually faster.
        </p>
      </div>
    </main>
  )
}
