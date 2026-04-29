import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { formatSalary, locationLabel, type PublicJob } from '@/lib/public-jobs'

export const metadata: Metadata = {
  title: 'Free Job Post — Healthcare jobs without the Indeed tax',
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Beta launching April 2026.',
}

// ISR: page rebuilds every 5 minutes so live job count + recent posts stay fresh
export const revalidate = 300

type RecentJob = Pick<PublicJob, 'id' | 'slug' | 'title' | 'city' | 'state' | 'salary_min' | 'salary_max'>

export default async function Home() {
  // Fetch live count + 6 most-recent active jobs in parallel
  const [countRes, recentRes] = await Promise.all([
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString()),
    supabase
      .from('public_jobs')
      .select('id, slug, title, city, state, salary_min, salary_max')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(6),
  ])
  const liveCount = countRes.count ?? 0
  const recentJobs = (recentRes.data ?? []) as RecentJob[]

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-xl tracking-tight">freejobpost<span className="text-green-700">.co</span></span>
            <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">BETA</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <Link href="/jobs" className="hover:text-green-700">Browse jobs</Link>
            <Link href="/how-it-works" className="hover:text-green-700">How it works</Link>
            <a href="https://www.freeresumepost.co" className="hover:text-green-700">For candidates</a>
            <Link href="/post-job" className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors">
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-32">
          <div className="inline-flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-bold tracking-wider mb-8">
            <span className="w-2 h-2 bg-green-600 animate-pulse" />
            {liveCount > 0 ? (
              <>{liveCount.toLocaleString()} ACTIVE HEALTHCARE JOBS</>
            ) : (
              <>FREE HEALTHCARE JOB BOARD</>
            )}
          </div>
          <h1 className="text-[64px] md:text-[104px] font-black leading-[0.92] tracking-tight mb-8">
            Free healthcare
            <br />
            job posts.
            <br />
            <span className="text-green-700">No Indeed tax.</span>
          </h1>
          <p className="text-xl md:text-2xl max-w-2xl leading-snug mb-10 text-gray-800">
            Post RN, MD, PT, and front-desk roles in 60 seconds. Real applicants.
            Zero auction fees. Built by a staffing team that got tired of paying to be seen.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center bg-black text-white px-6 py-4 text-base font-bold hover:bg-green-700 transition-colors"
            >
              Post a job →
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center border-2 border-black px-6 py-4 text-base font-bold hover:bg-black hover:text-white transition-colors"
            >
              Browse jobs
            </Link>
          </div>
          <p className="mt-8 text-sm text-gray-600">
            Hiring candidates? Send them to{' '}
            <a href="https://www.freeresumepost.co" className="font-bold underline hover:text-green-700">
              freeresumepost.co →
            </a>
          </p>
        </div>
      </section>

      {/* Three things */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-0 md:divide-x-2 md:divide-black">
          <div className="pr-0 md:pr-10 pb-10 md:pb-0 border-b-2 md:border-b-0 border-black">
            <div className="font-black text-6xl mb-4">01</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Free, forever</h2>
            <p className="text-gray-700 leading-relaxed">
              Post as many jobs as you want. No trial expiring. No per-applicant charges.
              No &ldquo;unlock this resume&rdquo; fees. If we ever charge, it&apos;s for optional boosts.
            </p>
          </div>
          <div className="px-0 md:px-10 pb-10 md:pb-0 border-b-2 md:border-b-0 border-black">
            <div className="font-black text-6xl mb-4">02</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Real applicants</h2>
            <p className="text-gray-700 leading-relaxed">
              Candidates upload their own resumes at freeresumepost.co. No scraped profiles,
              no bots, no bid-for-visibility games. If they apply, they&apos;re real people who chose you.
            </p>
          </div>
          <div className="pl-0 md:pl-10">
            <div className="font-black text-6xl mb-4">03</div>
            <h2 className="text-xl font-black mb-3 uppercase tracking-tight">Matches come to you</h2>
            <p className="text-gray-700 leading-relaxed">
              Our matching engine surfaces candidates that fit by specialty, state, experience,
              and credential. You get a real email when hot matches apply — no dashboard check needed.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b-2 border-black bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-4">HOW IT WORKS</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight mb-16 max-w-3xl">
            Three steps. No credit card. No sales call.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: '01', h: 'Post', p: 'Fill the 60-second form: title, location, description, salary. Hit submit.' },
              { n: '02', h: 'Verify', p: 'We email you a one-click verification link. That\u2019s it — no account setup, no phone number.' },
              { n: '03', h: 'Get applicants', p: 'Real candidates see your post. They apply. You get emailed. Simple.' },
            ].map((step) => (
              <div key={step.n} className="bg-white border-2 border-black p-8">
                <div className="text-green-700 font-black text-xs tracking-widest mb-3">{step.n}</div>
                <h3 className="font-black text-2xl mb-3 tracking-tight">{step.h}</h3>
                <p className="text-gray-700 leading-relaxed">{step.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently posted */}
      <section className="border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">OPEN ROLES</h2>
              <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
                Fresh healthcare jobs.
              </p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center font-bold border-b-2 border-black hover:text-green-700 hover:border-green-700 pb-0.5"
            >
              View all →
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="border-2 border-black border-dashed py-16 text-center">
              <p className="text-2xl font-black mb-2">No jobs posted yet.</p>
              <p className="text-gray-700">
                Be the first.{' '}
                <Link href="/post-job" className="underline font-bold hover:text-green-700">
                  Post a job in 60 seconds &rarr;
                </Link>
              </p>
            </div>
          ) : (
            <div className="divide-y-2 divide-black border-y-2 border-black">
              {recentJobs.map((job) => {
                const salary = formatSalary(job.salary_min, job.salary_max)
                const loc = locationLabel({ city: job.city, state: job.state })
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.slug}`}
                    className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors group"
                  >
                    <div className="col-span-12 md:col-span-7 font-bold group-hover:text-green-700 truncate">
                      {job.title}
                    </div>
                    <div className="col-span-6 md:col-span-3 text-gray-700 text-sm">{loc || '—'}</div>
                    <div className="col-span-6 md:col-span-2 font-bold text-right">
                      {salary || ''}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b-2 border-black">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">FAQ</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight mb-12 tracking-tight">
            Common questions, fast answers.
          </p>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-black mb-2">Is freejobpost.co really free?</h3>
              <p className="text-gray-700 leading-relaxed">Yes. No paywall, no per-applicant fee, no &ldquo;sponsored&rdquo; auction. We make money downstream when a placement converts on the matching engine — the job-posting side stays free forever.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">How long does a job stay live?</h3>
              <p className="text-gray-700 leading-relaxed">60 days by default. You can repost any expired job in one click. Filled roles can be marked &quot;closed&quot; manually.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">Where else does my job get distributed?</h3>
              <p className="text-gray-700 leading-relaxed">When you check the syndication boxes during posting, your job is pushed to Indeed, ZipRecruiter, Glassdoor, LinkedIn, Adzuna, Jooble, Talent.com, Google for Jobs, and the freejobpost.co RSS feed — without any extra steps.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">Who&apos;s applying — real people or bots?</h3>
              <p className="text-gray-700 leading-relaxed">Real candidates. Resume uploads come from <a href="https://www.freeresumepost.co" className="underline font-bold hover:text-green-700">freeresumepost.co</a> — verified emails, parsed resumes, real credentials. We don&apos;t scrape profiles or auto-apply.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">Do you charge for &quot;unlocking&quot; an applicant?</h3>
              <p className="text-gray-700 leading-relaxed">No. When a candidate applies, you get their full contact info immediately. No paywall, no &quot;contact unlock&quot; fees, no upgrade prompts.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">What healthcare roles can I post?</h3>
              <p className="text-gray-700 leading-relaxed">Physicians, NPs, PAs, RNs, CRNAs, LPNs, therapists (PT/OT/SLP/AuD), pharmacists, MAs, lab techs, sonographers, paramedics, and most allied roles. We focus on US healthcare staffing — non-healthcare roles are out of scope.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2">How do candidates find my job?</h3>
              <p className="text-gray-700 leading-relaxed">Three paths: (1) the freejobpost.co listing pages that rank in search, (2) the matching engine that emails candidates a 70%+ fit, (3) the syndication feeds (Indeed, LinkedIn, etc.). Most jobs get applicants from all three.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Big CTA */}
      <section className="border-b-2 border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <p className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-8">
            Ready to post
            <br />
            your first job?
          </p>
          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-10">
            Free forever. 60 seconds to post. No auction, no account setup, no sales call.
          </p>
          <Link
            href="/post-job"
            className="inline-flex items-center bg-green-600 text-black px-8 py-5 text-lg font-black hover:bg-green-500 transition-colors"
          >
            Post a job free →
          </Link>
        </div>
      </section>

      {/* FAQPage JSON-LD — eligible for FAQ rich results in SERP */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              { '@type': 'Question', name: 'Is freejobpost.co really free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. No paywall, no per-applicant fee, no "sponsored" auction. We make money downstream when a placement converts on the matching engine — the job-posting side stays free forever.' } },
              { '@type': 'Question', name: 'How long does a job stay live?', acceptedAnswer: { '@type': 'Answer', text: '60 days by default. You can repost any expired job in one click. Filled roles can be marked "closed" manually.' } },
              { '@type': 'Question', name: 'Where else does my job get distributed?', acceptedAnswer: { '@type': 'Answer', text: 'When you check the syndication boxes during posting, your job is pushed to Indeed, ZipRecruiter, Glassdoor, LinkedIn, Adzuna, Jooble, Talent.com, Google for Jobs, and the freejobpost.co RSS feed.' } },
              { '@type': 'Question', name: "Who's applying — real people or bots?", acceptedAnswer: { '@type': 'Answer', text: "Real candidates. Resume uploads come from freeresumepost.co — verified emails, parsed resumes, real credentials. We don't scrape profiles or auto-apply." } },
              { '@type': 'Question', name: 'Do you charge for unlocking an applicant?', acceptedAnswer: { '@type': 'Answer', text: 'No. When a candidate applies, you get their full contact info immediately. No paywall, no "contact unlock" fees, no upgrade prompts.' } },
              { '@type': 'Question', name: 'What healthcare roles can I post?', acceptedAnswer: { '@type': 'Answer', text: 'Physicians, NPs, PAs, RNs, CRNAs, LPNs, therapists (PT/OT/SLP/AuD), pharmacists, MAs, lab techs, sonographers, paramedics, and most allied roles. We focus on US healthcare staffing.' } },
              { '@type': 'Question', name: 'How do candidates find my job?', acceptedAnswer: { '@type': 'Answer', text: 'Three paths: (1) the freejobpost.co listing pages that rank in search, (2) the matching engine that emails candidates a 70%+ fit, (3) the syndication feeds (Indeed, LinkedIn, etc.). Most jobs get applicants from all three.' } },
            ],
          }),
        }}
      />
    </main>
  )
}
