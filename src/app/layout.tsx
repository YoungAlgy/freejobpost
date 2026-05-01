import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import './globals.css'
import { buildOrganizationGraph } from '@/lib/organization-schema'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: {
    template: '%s | Free Job Post',
    default: 'Free Job Post — Post jobs free, healthcare hiring without the Indeed tax',
  },
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Free Job Post is where growing employers hire.',
  metadataBase: new URL('https://freejobpost.co'),
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': [
        { url: '/feeds/rss.xml', title: 'freejobpost.co — Healthcare jobs (RSS)' },
      ],
    },
  },
  openGraph: {
    siteName: 'Free Job Post',
    type: 'website',
    locale: 'en_US',
    url: 'https://freejobpost.co',
    title: 'Free Job Post — Healthcare jobs without the Indeed tax',
    description: 'Post jobs free. Apply free. No auction fees, no paywall, no recruiter spam.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Job Post — Free healthcare job posts',
    description: 'Post jobs free. No auction, no paywall.',
    site: '@avahealth',
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
  category: 'business',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://tsruqbodyrmxqzhvxret.supabase.co"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://tsruqbodyrmxqzhvxret.supabase.co"
        />
        {/* Organization + WebSite schema applies to every page so Google
            understands the brand entity and surfaces the sitelinks search box.
            Per-page JSON-LD (e.g. JobPosting on /jobs/[slug]) supplements this.
            Schema source: src/lib/organization-schema.ts (mirrored to freeresumepost). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              buildOrganizationGraph({
                websiteUrl: 'https://freejobpost.co',
                websiteName: 'Free Job Post',
                websiteDescription:
                  'Free healthcare job board. Post jobs free. Apply free. No auction fees.',
                organizationDescription:
                  'Healthcare staffing and recruiting firm connecting physicians, nurses, and therapists with US healthcare employers. Operates freejobpost.co — a free healthcare job board with no posting fees and no auction pricing.',
                searchActionTarget: 'https://freejobpost.co/jobs?q={search_term_string}',
                additionalSameAs: ['https://www.linkedin.com/company/freejobpost/'],
              })
            ),
          }}
        />
      </head>
      <body className={inter.className}>
        {children}
        <footer className="max-w-6xl mx-auto px-4 py-8 mt-12 border-t border-gray-200">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href="/jobs" className="hover:text-gray-900">
                Browse jobs
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/post-job" className="hover:text-gray-900">
                Post a job
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="https://www.freeresumepost.co" className="hover:text-gray-900">
                Candidates
              </Link>
              <span className="text-gray-300">|</span>
              <a
                href="https://www.linkedin.com/company/freejobpost/"
                rel="me noopener"
                target="_blank"
                className="hover:text-gray-900"
              >
                LinkedIn
              </a>
              <span className="text-gray-300">|</span>
              <Link href="/terms" className="hover:text-gray-900">
                Terms
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/privacy" className="hover:text-gray-900">
                Privacy
              </Link>
            </div>
            <p className="text-xs text-gray-400 text-center md:text-right max-w-md">
              Operated by{' '}
              <Link href="https://avahealth.co" className="underline hover:text-gray-900">
                Ava Health Partners LLC
              </Link>
              . A free-to-use job board for healthcare employers.
              <br />
              1314 7th Street South, St. Petersburg, FL 33701 · (904) 343-9449 · info@avahealth.co
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
