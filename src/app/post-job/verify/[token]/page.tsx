import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Verifying your job post…',
  robots: { index: false, follow: false },
}

// No ISR — this is a one-shot consume path.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type VerifyResponse =
  | { success: true; was_already_verified: boolean; job_slug: string }
  | { success: false; error: string }

async function consumeToken(token: string): Promise<VerifyResponse> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/post-job-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    })
    const body = await res.json()
    if (!res.ok || !body.success) {
      return { success: false, error: body.error || `HTTP ${res.status}` }
    }
    return body as VerifyResponse
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export default async function VerifyTokenPage({ params }: Props) {
  const { token } = await params
  const decoded = decodeURIComponent(token ?? '')
  const result = decoded ? await consumeToken(decoded) : { success: false as const, error: 'Missing token' }

  return (
    <main className="min-h-screen bg-white text-black">
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-xl tracking-tight">
              freejobpost<span className="text-green-700">.co</span>
            </span>
            <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
              BETA
            </span>
          </Link>
          <Link href="/jobs" className="text-sm font-medium hover:text-green-700">
            Browse jobs
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {result.success ? (
          <div className="border-2 border-black p-8 md:p-10 bg-green-50">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-green-600" />
              {result.was_already_verified ? 'ALREADY VERIFIED' : 'VERIFIED'}
            </div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
              {result.was_already_verified ? 'Already live.' : 'Your job is live.'}
            </h1>
            <p className="text-lg text-gray-800 mb-6">
              {result.was_already_verified
                ? 'This link was used before. Your job was already published.'
                : 'Verified. Candidates can see and apply now.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/jobs/${result.job_slug}`}
                className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
              >
                View your job →
              </Link>
              <Link
                href="/post-job"
                className="inline-flex items-center border-2 border-black px-6 py-3 font-bold hover:bg-black hover:text-white transition-colors"
              >
                Post another
              </Link>
            </div>
          </div>
        ) : (
          <div className="border-2 border-black p-8 md:p-10">
            <div className="inline-flex items-center gap-2 border-2 border-black bg-red-50 px-3 py-1 text-xs font-bold tracking-wider mb-6">
              <span className="w-2 h-2 bg-red-600" />
              COULDN&apos;T VERIFY
            </div>
            <h1 className="text-3xl md:text-4xl font-black leading-tight mb-4">
              This link didn&apos;t work.
            </h1>
            <p className="text-lg text-gray-700 mb-6">
              It may have expired (48-hour window) or been tampered with.
              You can post the job again — it takes 90 seconds.
            </p>
            <p className="text-xs text-gray-500 font-mono mb-6">{result.error}</p>
            <Link
              href="/post-job"
              className="inline-flex items-center bg-black text-white px-6 py-3 font-bold hover:bg-green-700 transition-colors"
            >
              Start over →
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
