'use client'

// Shared site header for freejobpost.co — Ava Health logomark + primary nav.
// Mounted once in layout.tsx (right after AvaFamilyNav) so every page renders
// the SAME header at the same height, mirroring providers.avahealth.co's
// Header. Replaces the per-page inline <nav> blocks that used to drift between
// pages. Keep the structure in lockstep with the other family apps:
// sticky top-0, h-16, Logo(32) + "Ava Health" bold navy, CTA on the right.

import Link from 'next/link'
import { useState } from 'react'
import { Logo } from './Logo'

// Order + cross-link mirror freeresumepost.co's header so the two read as one
// product. The cross-app link ("For candidates") is an absolute URL; next/link
// renders it as a normal <a> and does a full cross-domain navigation.
const NAV = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'For candidates', href: 'https://www.freeresumepost.co' },
  { label: 'Browse jobs', href: '/jobs' },
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
          <span className="text-lg font-bold tracking-tight text-[#003D5C]">Ava Health</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[#003D5C] transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/post-job"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[#7FBC00] hover:bg-[#6da300] text-white text-sm font-semibold transition-colors"
          >
            Post a job →
          </Link>

          {/* Mobile hamburger — only below md, where the desktop nav is hidden */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center p-2 -mr-1 rounded-lg text-[#003D5C] hover:bg-gray-100 transition-colors"
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
              className="block py-3 text-base font-medium text-gray-700 hover:text-[#003D5C] border-b border-gray-100 last:border-0 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/post-job"
            onClick={() => setMobileOpen(false)}
            className="block py-3 text-base font-semibold text-[#7FBC00]"
          >
            Post a job →
          </Link>
        </nav>
      )}
    </header>
  )
}

export default SiteHeader
