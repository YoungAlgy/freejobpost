import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Free Job Post terms of use. Healthcare job board operated by Ava Health Partners LLC.',
  alternates: { canonical: 'https://freejobpost.co/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
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
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-600 mb-10">Last updated April 27, 2026</p>

        <div className="space-y-6 text-gray-800 leading-relaxed">
          <p>
            Welcome to <strong>freejobpost.co</strong>, a healthcare job board operated by
            Ava Health Partners LLC (&quot;Ava Health,&quot; &quot;we,&quot; &quot;us&quot;).
            By using freejobpost.co you agree to these Terms of Use.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">1. Free to use</h2>
          <p>
            freejobpost.co is free to browse, free to apply, and free to post jobs. We do not charge
            employers or candidates. We do not run sponsored-bid auctions or paywall applicant data.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">2. Posting a job</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>You must be authorized to recruit on behalf of the employer you list.</li>
            <li>Job posts must be for real, currently-open positions in healthcare.</li>
            <li>Posts may not include misleading compensation, fake credentials, or scrape-bait content.</li>
            <li>We reserve the right to remove posts that violate these rules without notice.</li>
            <li>Posted content (job titles, descriptions) becomes publicly indexable and may be syndicated to Indeed, Google for Jobs, ZipRecruiter, and other aggregators via our XML feed.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">3. Applying to a job</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Application data (name, email, phone, resume URL) is shared directly with the posting employer.</li>
            <li>We do not sell or rent your contact info to third parties.</li>
            <li>Applying for a job indicates your interest in being contacted by that specific employer about that specific role.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">4. Account-free access</h2>
          <p>
            freejobpost.co does not require account creation to browse, apply, or post.
            Employers verify their email via a one-click magic link to manage their posts.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">5. Prohibited use</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Scraping at rates that affect site performance.</li>
            <li>Posting misleading, discriminatory, or non-healthcare jobs.</li>
            <li>Attempting to circumvent rate limits, suppression, or verification.</li>
            <li>Harvesting candidate contact info for unrelated commercial use.</li>
          </ul>

          <h2 className="text-xl font-black mt-8 mb-2">6. Content + intellectual property</h2>
          <p>
            Job posts you submit remain yours; you grant us a non-exclusive license to display + syndicate
            them while they&apos;re active. Our site design, code, and content are owned by Ava Health Partners LLC.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">7. Disclaimers</h2>
          <p>
            freejobpost.co is provided &quot;as is.&quot; We do not verify employer claims or guarantee
            that any job will be filled. We are not party to the eventual employment relationship.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">8. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Ava Health Partners LLC is not liable for indirect,
            incidental, or consequential damages arising from use of freejobpost.co.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">9. Changes to these terms</h2>
          <p>
            We may update these terms; the &quot;Last updated&quot; date above will reflect the most recent revision.
            Continued use after changes constitutes acceptance.
          </p>

          <h2 className="text-xl font-black mt-8 mb-2">10. Contact</h2>
          <p>
            Questions? <a href="mailto:hello@avahealth.co" className="underline hover:text-green-700">hello@avahealth.co</a>
          </p>

          <p className="mt-10 text-sm text-gray-600">
            See also: <Link href="/privacy" className="underline hover:text-green-700">Privacy Policy</Link>
          </p>
        </div>
      </article>
    </main>
  )
}
