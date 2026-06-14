import type { Metadata } from 'next'
import { Suspense } from 'react'
import UnsubscribeClient from './unsubscribe-client'

export const metadata: Metadata = {
  title: 'Unsubscribe | freejobpost.co',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen bg-white text-black flex items-center justify-center px-6 py-20">
      <Suspense fallback={<div className="h-40" aria-hidden="true" />}>
        <UnsubscribeClient />
      </Suspense>
    </main>
  )
}
