import Link from 'next/link'
import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

// Error messages surfaced when the user lands here from a failed
// /employer/verify/[token] redirect. Keep them generic — don't leak whether
// a token previously existed. Just tell the user what to do next.
const ERROR_MESSAGES: Record<string, string> = {
  bad_token:
    'Your sign-in link is invalid or has expired. Enter your email below and we\'ll send a fresh one.',
  missing_token:
    'Sign-in link was missing. Enter your email and we\'ll send you a new one.',
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

export default async function EmployerLoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] : null

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="max-w-md mx-auto px-6 py-16 md:py-20">
        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-4">
          Employer sign-in
        </p>
        <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight mb-4 text-[#003D5C]">
          Manage your posts.
        </h1>
        <p className="text-gray-700 mb-8">
          Enter the email you used to post. We&apos;ll send you a sign-in link,
          click it and you&apos;re in. No password.
        </p>

        {errorMessage && (
          <div className="border-2 border-amber-600 bg-amber-50 p-3 text-amber-900 text-sm font-medium mb-6">
            {errorMessage}
          </div>
        )}

        <LoginForm />

        <p className="mt-8 text-sm text-gray-500">
          First time here?{' '}
          <Link href="/post-job" className="font-bold underline hover:text-[#003D5C]">
            Post a job →
          </Link>
        </p>
      </div>
    </main>
  )
}
