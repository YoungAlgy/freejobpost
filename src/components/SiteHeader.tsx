'use client'

// Shared FreeJobPost header. The wordmark, icon, and navigation are owned by
// this product and do not cross-link the Ava product family.

import Link from 'next/link'
import { useState } from 'react'
import { Logo } from './Logo'

const NAV = [
  { label: 'Browse jobs', href: '/jobs' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Employer login', href: '/employer' },
]

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => setMobileOpen(false)}
        >
          <Logo size={32} className="shrink-0" />
          <span className="text-lg font-black tracking-[-0.03em] text-[#17324D]">FreeJobPost</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[#17324D] transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/post-job"
            className="inline-flex min-h-10 items-center rounded-lg bg-[#276749] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1F563B]"
          >
            Post a job
          </Link>

          {/* Mobile hamburger — only below md, where the desktop nav is hidden */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center p-2 -mr-1 rounded-lg text-[#17324D] hover:bg-gray-100 transition-colors"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav panel */}
      {mobileOpen && (
        <nav id="mobile-nav" className="md:hidden border-t border-gray-200 bg-white px-4 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="block py-3 text-base font-medium text-gray-700 hover:text-[#17324D] border-b border-gray-100 last:border-0 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export default SiteHeader
