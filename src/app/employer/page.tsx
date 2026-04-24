import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Dashboard from './dashboard'

export const metadata: Metadata = {
  title: 'Dashboard · freejobpost.co',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const COOKIE_NAME = 'employer_session'

type Job = {
  id: string
  slug: string
  title: string
  role: string | null
  specialty: string | null
  city: string | null
  state: string | null
  remote_hybrid: string | null
  employment_type: string | null
  salary_min: number | null
  salary_max: number | null
  status: string
  apply_count: number
  view_count: number
  created_at: string
  expires_at: string
}

type Employer = {
  id: string
  company_name: string
  contact_name: string | null
  contact_email: string
  tier: string
  verified_healthcare_org: boolean
  status: string
}

async function loadSession(): Promise<{ employer: Employer; jobs: Job[] } | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  let decoded = ''
  try {
    decoded = Buffer.from(token.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
  const [employer_id, nonce] = decoded.split('|')
  if (!employer_id || !nonce) return null

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await sb.rpc('consume_employer_login_rpc', {
    p_employer_id: employer_id,
    p_nonce: nonce,
  })
  if (error) return null
  const r = data as { success: boolean; employer?: Employer; jobs?: Job[] }
  if (!r.success || !r.employer) return null
  return { employer: r.employer, jobs: r.jobs ?? [] }
}

export default async function EmployerDashboardPage() {
  const session = await loadSession()
  if (!session) redirect('/employer/login')

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
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 hidden md:inline">
              Signed in as <strong>{session.employer.contact_email}</strong>
            </span>
            <Link href="/post-job" className="font-bold hover:text-green-700">
              + New post
            </Link>
          </div>
        </div>
      </nav>

      <Dashboard employer={session.employer} jobs={session.jobs} />
    </main>
  )
}
