import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Signing in…',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

const COOKIE_NAME = 'employer_session'

export default async function VerifyTokenPage({ params }: Props) {
  const { token } = await params
  const raw = decodeURIComponent(token ?? '')
  if (!raw) {
    redirect('/employer/login?error=missing_token')
  }

  let decoded = ''
  try {
    decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    redirect('/employer/login?error=bad_token')
  }
  const [employer_id, nonce] = decoded.split('|')
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      employer_id ?? ''
    ) ||
    !nonce ||
    nonce.length < 16
  ) {
    redirect('/employer/login?error=bad_token')
  }

  const store = await cookies()
  store.set(COOKIE_NAME, raw, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/employer',
    maxAge: 30 * 24 * 3600,
  })

  redirect('/employer')
}
