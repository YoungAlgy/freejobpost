import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'How freejobpost.co works — free healthcare job posts, no auction, no paywall, no recruiter spam. The 90-second post flow + everything that happens after.',
  alternates: { canonical: 'https://freejobpost.co/how-it-works' },
  robots: { index: true, follow: true },
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-black text-xl tracking-tight">
            freejobpost<span className="text-green-700">.co</span>
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link href="/jobs" className="hover:text-green-700">Browse jobs</Link>
            <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold">Post a job</Link>
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-6">
          <span className="w-2 h-2 bg-green-600" />
          HOW IT WORKS
        </div>
        <h1 className="text-4xl md:text-5xl font-black leading-[0.95] tracking-tight mb-6">
          Free healthcare job posts.<br />
          <span className="text-green-700">Without the Indeed tax.</span>
        </h1>
        <p className="text-lg text-gray-700 leading-relaxed mb-12">
          freejobpost.co is a utility, not a SaaS. We don&apos;t charge employers, we don&apos;t auction
          visibility, we don&apos;t sell candidate emails. Here&apos;s how it actually works.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3">For employers</h2>
        <ol className="space-y-5 mb-12">
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-black text-white text-sm font-black flex items-center justify-center">1</div>
            <div>
              <div className="font-black text-lg mb-1">Fill the 90-second form</div>
              <div className="text-gray-700">Title, role, location, comp, description. No account, no credit card.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-black text-white text-sm font-black flex items-center justify-center">2</div>
            <div>
              <div className="font-black text-lg mb-1">Verify your email (one click)</div>
              <div className="text-gray-700">We email you a magic link. Click it; your job is live. No password to remember.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-black text-white text-sm font-black flex items-center justify-center">3</div>
            <div>
              <div className="font-black text-lg mb-1">Get applicants in your inbox</div>
              <div className="text-gray-700">Real candidates apply directly to you. No screening fee, no upsell, no &quot;unlock this resume&quot; charge. We&apos;re not in the loop.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-black text-white text-sm font-black flex items-center justify-center">4</div>
            <div>
              <div className="font-black text-lg mb-1">Manage from your free dashboard</div>
              <div className="text-gray-700">All your posts, applicant counts, and status — at <Link href="/employer" className="underline hover:text-green-700">/employer</Link>. Magic-link login, no password.</div>
            </div>
          </li>
        </ol>

        <h2 className="text-2xl font-black tracking-tight mb-3">For candidates</h2>
        <ol className="space-y-5 mb-12">
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-green-700 text-white text-sm font-black flex items-center justify-center">1</div>
            <div>
              <div className="font-black text-lg mb-1">Browse jobs (no account)</div>
              <div className="text-gray-700">Filter by role, state, employment type. Pure list, no &quot;featured&quot; ads burying organic posts.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-green-700 text-white text-sm font-black flex items-center justify-center">2</div>
            <div>
              <div className="font-black text-lg mb-1">Apply directly to the employer</div>
              <div className="text-gray-700">Name, email, phone, optional resume URL, optional note. Goes straight to the employer&apos;s inbox.</div>
            </div>
          </li>
          <li className="flex gap-4">
            <div className="shrink-0 w-8 h-8 bg-green-700 text-white text-sm font-black flex items-center justify-center">3</div>
            <div>
              <div className="font-black text-lg mb-1">Want a profile that auto-matches?</div>
              <div className="text-gray-700">Upload your resume at <a href="https://www.freeresumepost.co/upload" className="underline hover:text-green-700">freeresumepost.co</a> — we&apos;ll email you when a 70%+ match opens that fits your specialty + state.</div>
            </div>
          </li>
        </ol>

        <h2 className="text-2xl font-black tracking-tight mb-3">vs the alternatives</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-12">
          <div className="border-2 border-black p-5">
            <div className="text-xs font-bold tracking-wider text-gray-500 uppercase mb-2">Indeed Sponsored</div>
            <ul className="space-y-1.5 text-sm text-gray-700">
              <li>· $0.10–$5.00 per click bid</li>
              <li>· Posts demoted below paid ads</li>
              <li>· Candidate emails resold to recruiters</li>
              <li>· Average cost per role: $300+</li>
            </ul>
          </div>
          <div className="border-2 border-green-700 bg-green-50 p-5">
            <div className="text-xs font-bold tracking-wider text-green-700 uppercase mb-2">freejobpost.co</div>
            <ul className="space-y-1.5 text-sm text-gray-800 font-medium">
              <li>· $0 — no fees, ever</li>
              <li>· Same indexing, no demotion</li>
              <li>· Candidate emails go to you only</li>
              <li>· Post unlimited roles for free</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-gray-600 mb-12">
          Posts are syndicated to Google for Jobs + Indeed&apos;s organic feed via{' '}
          <a href="/jobs.xml" className="underline hover:text-green-700">our public XML feed</a>.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3">Why is this free?</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          freejobpost.co is operated by Ava Health Partners LLC, a healthcare staffing firm. We
          maintain a candidate database for our placement business. The job board feeds candidates
          into that database; the database fuels our recruiting. The board itself doesn&apos;t need to
          monetize because the upstream business already does.
        </p>
        <p className="text-gray-700 leading-relaxed mb-12">
          We don&apos;t spam your applicants. We don&apos;t cold-recruit your existing staff. We don&apos;t resell
          your job posts to competing sites. Read our <Link href="/privacy" className="underline hover:text-green-700">privacy policy</Link> for the specifics.
        </p>

        <h2 className="text-2xl font-black tracking-tight mb-3">FAQ</h2>
        <div className="space-y-6 mb-12">
          <div>
            <h3 className="font-black mb-1">Is it really free to post a job?</h3>
            <p className="text-gray-700">Yes. No fees, no credit card, no trial period that quietly converts. We don&apos;t charge employers because the upstream Ava Health recruiting business already monetizes its candidate database — the job board feeds that database.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">How long does a posted job stay live?</h3>
            <p className="text-gray-700">60 days by default. You can repost the same role anytime; we don&apos;t cap the number of postings per employer.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Will my job appear on Indeed and Google for Jobs?</h3>
            <p className="text-gray-700">Yes. Every posted job lands in our public XML feed at /jobs.xml, which Indeed&apos;s organic crawler picks up automatically. We also emit JobPosting structured data on every job page so Google for Jobs indexes it within hours.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Do you sell my company name or contact info?</h3>
            <p className="text-gray-700">No. We don&apos;t resell employer data, we don&apos;t cold-pitch your existing staff, and we don&apos;t hand your applicants to competing recruiters. See our privacy policy for the specifics.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">Who can post a job here?</h3>
            <p className="text-gray-700">US-based healthcare employers — hospitals, private groups, FQHCs, urgent cares, telehealth providers, locum agencies, and pharmacies. We don&apos;t accept third-party staffing-agency reposts or expired roles.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">What roles can I post?</h3>
            <p className="text-gray-700">All clinical and clinical-adjacent healthcare roles: physicians, NPs, PAs, RNs, CRNAs, therapists (PT, OT, SLP, AuD), pharmacists, and allied health. We don&apos;t accept non-clinical roles (admin, accounting, marketing) at this time.</p>
          </div>
          <div>
            <h3 className="font-black mb-1">How fast does my job get listed?</h3>
            <p className="text-gray-700">Instant. Submit the form and it&apos;s live within seconds. The XML feed updates in real-time; Google for Jobs and Indeed typically index new postings within 4-24 hours.</p>
          </div>
        </div>

        <div className="border-2 border-black bg-black text-white p-8 text-center">
          <p className="text-2xl font-black mb-3">Ready?</p>
          <Link href="/post-job" className="inline-block bg-green-700 text-white font-bold px-6 py-3 hover:bg-green-600">
            Post a job for free →
          </Link>
        </div>
      </article>

      {/* FAQPage schema — eligible for FAQ rich results in SERP */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'Is it really free to post a job?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "Yes. No fees, no credit card, no trial period that quietly converts. We don't charge employers because the upstream Ava Health recruiting business already monetizes its candidate database — the job board feeds that database.",
                },
              },
              {
                '@type': 'Question',
                name: 'How long does a posted job stay live?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "60 days by default. You can repost the same role anytime; we don't cap the number of postings per employer.",
                },
              },
              {
                '@type': 'Question',
                name: 'Will my job appear on Indeed and Google for Jobs?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "Yes. Every posted job lands in our public XML feed at /jobs.xml, which Indeed's organic crawler picks up automatically. We also emit JobPosting structured data on every job page so Google for Jobs indexes it within hours.",
                },
              },
              {
                '@type': 'Question',
                name: 'Do you sell my company name or contact info?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "No. We don't resell employer data, we don't cold-pitch your existing staff, and we don't hand your applicants to competing recruiters.",
                },
              },
              {
                '@type': 'Question',
                name: 'Who can post a job here?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "US-based healthcare employers — hospitals, private groups, FQHCs, urgent cares, telehealth providers, locum agencies, and pharmacies.",
                },
              },
              {
                '@type': 'Question',
                name: 'What roles can I post?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "All clinical and clinical-adjacent healthcare roles: physicians, NPs, PAs, RNs, CRNAs, therapists (PT, OT, SLP, AuD), pharmacists, and allied health.",
                },
              },
              {
                '@type': 'Question',
                name: 'How fast does my job get listed?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: "Instant. Submit the form and it's live within seconds. Google for Jobs and Indeed typically index new postings within 4-24 hours.",
                },
              },
            ],
          }),
        }}
      />
    </main>
  )
}
