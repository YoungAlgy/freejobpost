import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'

import { SiteHeader } from '@/components/SiteHeader'
import { FREEJOBPOST_SUPPORT_EMAIL } from '@/lib/freejobpost-email'
import { buildOrganizationGraph } from '@/lib/organization-schema'
import { safeJsonLd } from '@/lib/safe-jsonld'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: {
    template: '%s | FreeJobPost',
    default: 'Nursing and Allied Health Jobs | FreeJobPost',
  },
  description:
    'A free job posting and application tool for nursing and allied health employers and job seekers.',
  metadataBase: new URL('https://freejobpost.co'),
  alternates: {
    types: {
      'application/rss+xml': [
        { url: '/feeds/rss.xml', title: 'FreeJobPost nursing and allied health jobs' },
      ],
    },
  },
  openGraph: {
    siteName: 'FreeJobPost',
    type: 'website',
    locale: 'en_US',
    url: 'https://freejobpost.co',
    title: 'Nursing and Allied Health Jobs | FreeJobPost',
    description: 'Post nursing and allied health jobs free, then receive applications directly.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nursing and Allied Health Jobs | FreeJobPost',
    description: 'Post nursing and allied health jobs free.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: [
      'SFRvinmueg87J1kMFBhvpABzmM1c13pLPCTRYjrRlVI',
      'YCQkKHLaNBXGsPqVDsAZJlJoKm1zARs9_acvOQgw0pw',
    ],
    other: { 'msvalidate.01': 'AC806718B7170AF0A71011FC59BD9A88' },
  },
  category: 'business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(
              buildOrganizationGraph({
                websiteUrl: 'https://freejobpost.co',
                websiteName: 'FreeJobPost',
                websiteDescription:
                  'A free job posting and application tool for nursing and allied health.',
                organizationDescription:
                  'FreeJobPost is an independent job board for nursing and allied health roles posted by employers.',
                supportEmail: FREEJOBPOST_SUPPORT_EMAIL,
                searchActionTarget: 'https://freejobpost.co/jobs?q={search_term_string}',
              }),
            ),
          }}
        />
      </head>
      <body className={inter.className}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[#17324D] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <div id="main-content">{children}</div>
        <footer className="border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
            <nav
              aria-label="Footer"
              className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-gray-600"
            >
              <Link href="/jobs" className="hover:text-[#17324D]">Browse jobs</Link>
              <Link href="/post-job" className="hover:text-[#17324D]">Post a job</Link>
              <Link href="/employer" className="hover:text-[#17324D]">Employer login</Link>
              <Link href="/how-it-works" className="hover:text-[#17324D]">How it works</Link>
              <Link href="/terms" className="hover:text-[#17324D]">Terms</Link>
              <Link href="/privacy" className="hover:text-[#17324D]">Privacy</Link>
            </nav>
            <div className="mt-6 border-t border-gray-100 pt-6 text-xs leading-5 text-gray-500">
              <p>&copy; {new Date().getFullYear()} FreeJobPost.</p>
              <p className="mt-1">
                FreeJobPost is owned and operated by Ava Health Partners LLC, 4532 W Kennedy Blvd,
                Suite 125, Tampa, FL 33609. Contact:{' '}
                <a href={`mailto:${FREEJOBPOST_SUPPORT_EMAIL}`} className="underline">
                  {FREEJOBPOST_SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
