import type { Metadata } from 'next'

// /admin/* pages are internal-only. Robots noindex so they never leak into
// Google or Bing. Pages still need their own auth gate (shared-secret
// `?key=` for v1 — replace with real Supabase Auth once internal-user
// sessions are wired).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
