import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Free Job Post privacy policy. We never sell candidate contact data. Operated by Ava Health Partners LLC.',
  alternates: { canonical: 'https://freejobpost.co/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <nav className="border-b-2 border-black">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-black text-xl tracking-tight">
            freejobpost<span className="text-green-700">.co</span>
          </Link>
          <Link href="/jobs" className="text-sm font-bold hover:text-green-700">Browse jobs</Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-10">Last updated April 27, 2026</p>

        <div className="space-y-6 text-gray-800 leading-relaxed">
          <p>
            Ava Health Partners LLC (&quot;we&quot;) operates <strong>freejobpost.co</strong>. This policy
            describes what data we collect, why, and what we do (and don&apos;t) do with it.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">The short version</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We do not sell or rent contact data.</li>
            <li>Job applications go directly to the posting employer.</li>
            <li>No account is required to browse, apply, or post.</li>
            <li>We use cookies for basic analytics (page views, traffic sources) and nothing else.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">What we collect</h2>
          <p><strong>From job posters (employers):</strong></p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Email address (for verification + post management)</li>
            <li>Company name + optional company URL</li>
            <li>The content of your job post itself</li>
          </ul>
          <p><strong>From job applicants (candidates):</strong></p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Name, email, phone (optional), resume URL (optional)</li>
            <li>The job you applied to</li>
            <li>Optional short note to the employer</li>
          </ul>
          <p><strong>From all visitors:</strong></p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Standard server log data (IP address, user agent, referrer) for traffic analytics + abuse prevention</li>
            <li>No third-party tracking pixels (no Facebook Pixel, no Google Ads conversion tracking)</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">How we use your data</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Job applicants:</strong> we forward your application contact info to the posting employer. The employer may reach out to you about that specific role. Beyond that, we do not contact you.</li>
            <li><strong>Job posters:</strong> we use your email to send post-verification, to alert you when applicants submit, and for occasional product updates (which you can opt out of).</li>
            <li><strong>Aggregated traffic:</strong> we look at usage trends (popular job categories, geographic distribution) to improve the product. Aggregated, never individually identifiable.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">What we don&apos;t do</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We do not sell candidate emails or resumes to recruiters or third parties.</li>
            <li>We do not run remarketing or behavioral ad targeting.</li>
            <li>We do not share data with sister sites except as the user explicitly initiates (e.g. applying for a job from freeresumepost.co/profile).</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">Cookies + analytics</h2>
          <p>
            We use cookies only for: session continuity (employer login state), basic analytics
            (Vercel Analytics, page views), and CSRF protection on form submission. No advertising
            cookies. No cross-site trackers.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">Email + suppression</h2>
          <p>
            Transactional emails (post verification, applicant notifications) are sent via Resend.
            We honor unsubscribe requests immediately and add the email to a permanent suppression list.
            We do not run cold-email campaigns; if you receive unsolicited mail claiming to be from us,
            forward it to <a href="mailto:hello@avahealth.co" className="underline hover:text-green-700">hello@avahealth.co</a>.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">Data retention + deletion</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Job posts are retained for 90 days post-expiration, then soft-deleted.</li>
            <li>Applications are retained for 12 months for legal/audit reasons, then deleted.</li>
            <li>You can request deletion of your data anytime by emailing <a href="mailto:hello@avahealth.co" className="underline hover:text-green-700">hello@avahealth.co</a>.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">Your rights (CCPA / GDPR)</h2>
          <p>
            California + EU residents: you have the right to access, correct, or delete your data.
            Email <a href="mailto:hello@avahealth.co" className="underline hover:text-green-700">hello@avahealth.co</a> with the subject &quot;Privacy request&quot; — we&apos;ll respond within 30 days.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">Security</h2>
          <p>
            We use industry-standard encryption in transit (TLS 1.2+) and at rest. Our database is hosted
            on Supabase (SOC 2 Type II) with row-level security on all candidate-facing tables.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">Operator</h2>
          <p>
            <strong>Ava Health Partners LLC</strong><br />
            3608 S Belcher Dr<br />
            Tampa, FL 33629<br />
            <a href="mailto:hello@avahealth.co" className="underline hover:text-green-700">hello@avahealth.co</a>
          </p>

          <p className="mt-10 text-sm text-gray-600">
            See also: <Link href="/terms" className="underline hover:text-green-700">Terms of Use</Link>
          </p>
        </div>
      </article>
    </main>
  )
}
