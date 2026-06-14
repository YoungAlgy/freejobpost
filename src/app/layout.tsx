import type { Metadata } from 'next'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { buildOrganizationGraph } from '@/lib/organization-schema'
import { E_VERIFY } from '@/lib/e-verify-config'

import { safeJsonLd } from '@/lib/safe-jsonld'
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
    default: 'Free Job Post: Post jobs free, healthcare hiring without the Indeed tax',
  },
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Free Job Post is where growing employers hire.',
  metadataBase: new URL('https://freejobpost.co'),
  // NO root-level `canonical` here. With metadataBase set, a root canonical
  // of '/' is inherited by every page that doesn't declare its own
  // alternates — making closed-job pages, error states, and any future
  // canonical-less page tell Google "I am a copy of the homepage"
  // (live-verified during the 2026-06 audit). Pages declare their own.
  alternates: {
    types: {
      'application/rss+xml': [
        { url: '/feeds/rss.xml', title: 'freejobpost.co: Healthcare jobs (RSS)' },
      ],
    },
  },
  openGraph: {
    siteName: 'Free Job Post',
    type: 'website',
    locale: 'en_US',
    url: 'https://freejobpost.co',
    title: 'Free Job Post: Healthcare jobs without the Indeed tax',
    description: 'Post jobs free. Apply free. No auction fees, no paywall, no recruiter spam.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Job Post: Free healthcare job posts',
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
  // Search-engine verification — same youngalgy@gmail.com token used across
  // every Ava-owned property. Adding meta-tag verification on top of any
  // DNS TXT verification gives Google + Bing a redundant ownership signal
  // (belt-and-suspenders so verification doesn't silently lapse if DNS rotates).
  verification: {
    // 2026-05-29: the original token (1st) is NOT youngalgy@gmail.com's working
    // token — it never verified freejobpost.co in GSC. Added youngalgy's actual
    // URL-prefix token (2nd) via the homepage HTML-tag method, because the
    // HTML-FILE method (public/google…html) repeatedly failed to verify even
    // though the file is served 200 to Googlebot. An array renders both metas.
    google: [
      'SFRvinmueg87J1kMFBhvpABzmM1c13pLPCTRYjrRlVI',
      'YCQkKHLaNBXGsPqVDsAZJlJoKm1zARs9_acvOQgw0pw',
    ],
    other: { 'msvalidate.01': 'AC806718B7170AF0A71011FC59BD9A88' },
  },
  category: 'business',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-US">
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
            __html: safeJsonLd(
              buildOrganizationGraph({
                websiteUrl: 'https://freejobpost.co',
                websiteName: 'Free Job Post',
                websiteDescription:
                  'Free healthcare job board. Post jobs free. Apply free. No auction fees.',
                organizationDescription:
                  'Healthcare staffing and recruiting firm connecting physicians, nurses, and therapists with US healthcare employers. Operates freejobpost.co, a free healthcare job board with no posting fees and no auction pricing.',
                searchActionTarget: 'https://freejobpost.co/jobs?q={search_term_string}',
                additionalSameAs: ['https://www.linkedin.com/company/freejobpost/'],
              })
            ),
          }}
        />
      </head>
      <body className={inter.className}>
        {/* Skip-nav: keyboard users can jump past the nav directly to the main content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-black focus:text-white focus:text-sm focus:font-bold focus:rounded"
        >
          Skip to main content
        </a>
        <div id="main-content">
          {children}
        </div>
        <footer className="max-w-6xl mx-auto px-4 py-8 mt-12 border-t border-gray-200">
          {/* Popular-hub footer row — every page on the site links to
             these 9 hubs, giving Google a constant signal of where the
             important category surfaces live. Boosts crawl frequency
             + PageRank flow to long-tail combinations. Kept under 10
             links so the footer stays tasteful (Google's anti-footer-
             link-junk heuristic kicks in past ~30 sitewide links). */}
          <nav
            aria-label="Popular healthcare job hubs"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-500 mb-5 pb-5 border-b border-gray-100"
          >
            <span className="font-bold tracking-widest uppercase text-gray-700">
              Popular:
            </span>
            <Link href="/specialty/registered-nurse" className="hover:text-gray-900">RN jobs</Link>
            <span className="text-gray-300">·</span>
            <Link href="/specialty/nurse-practitioner" className="hover:text-gray-900">NP jobs</Link>
            <span className="text-gray-300">·</span>
            <Link href="/specialty/physician-assistant" className="hover:text-gray-900">PA jobs</Link>
            <span className="text-gray-300">·</span>
            <Link href="/specialty/family-medicine" className="hover:text-gray-900">Family medicine</Link>
            <span className="text-gray-300">·</span>
            <Link href="/specialty/cardiology" className="hover:text-gray-900">Cardiology</Link>
            <span className="text-gray-300">·</span>
            <Link href="/state/florida" className="hover:text-gray-900">Florida</Link>
            <span className="text-gray-300">·</span>
            <Link href="/state/texas" className="hover:text-gray-900">Texas</Link>
            <span className="text-gray-300">·</span>
            <Link href="/state/california" className="hover:text-gray-900">California</Link>
            <span className="text-gray-300">·</span>
            <Link href="/jobs/federal" className="hover:text-gray-900">Federal</Link>
            <span className="text-gray-300">·</span>
            <Link href="/become" className="hover:text-gray-900">Career guides</Link>
          </nav>
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
              <Link href="/for-employers" className="hover:text-gray-900">
                For employers
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/employers" className="hover:text-gray-900">
                Employers
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/pricing" className="hover:text-gray-900">
                Pricing
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/changelog" className="hover:text-gray-900">
                Changelog
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
            <p className="text-xs text-gray-500 text-center md:text-right max-w-md">
              &copy; {new Date().getFullYear()} Operated by{' '}
              <Link href="https://avahealth.co" className="underline hover:text-gray-900">
                Ava Health Partners LLC
              </Link>
              . A free-to-use job board for healthcare employers.
              <br />
              4532 W Kennedy Blvd, Suite 125, Tampa, FL 33609 · (904) 343-9449 · info@avahealth.co
            </p>
          </div>
          {/* EEO statement — broad federal-compliance language so candidates
              and employers see the equal-opportunity commitment without a
              recruiter-specific role context. */}
          <p className="text-[11px] text-gray-600 text-center leading-relaxed mt-6 max-w-3xl mx-auto px-4">
            Ava Health Partners LLC is an Equal Opportunity Employer. We do not discriminate in employment or recruitment on the basis of race, color, religion, sex (including pregnancy, sexual orientation, or gender identity), national origin, age, disability, genetic information, veteran status, or any other characteristic protected by applicable federal, state, or local law.
          </p>
          {/* E-Verify participation chip — short footer link to /e-verify
              which holds the full federal-compliance statement + posters.
              Gated behind src/lib/e-verify-config.ts; renders nothing until
              E_VERIFY.enrolled with a real Company ID. */}
          {E_VERIFY.enrolled && E_VERIFY.companyId && (
            <p className="text-[11px] text-gray-600 text-center leading-relaxed mt-3">
              <Link href="/e-verify" className="underline hover:text-gray-900">
                E-Verify Participant
              </Link>{' '}
              &middot; Company ID {E_VERIFY.companyId}
            </p>
          )}
        </footer>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
