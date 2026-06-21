import Link from 'next/link'
import type { Metadata } from 'next'
import { Logo } from '@/components/Logo'
import { supabase, hourIso } from '@/lib/supabase'
import { formatSalary, locationLabel, type PublicJob } from '@/lib/public-jobs'
import { SPECIALTY_HUBS } from '@/lib/specialty-slugs'
import { STATE_HUBS } from '@/lib/state-slugs'
import { CITY_HUBS } from '@/lib/city-slugs'

export const metadata: Metadata = {
  // `absolute` bypasses the layout template `%s | Ava Health`. Without it the
  // rendered title would be double-branded ("<title> | Ava Health | Ava Health").
  title: { absolute: 'Free Healthcare Jobs. Post and Apply Free | Ava Health' },
  description:
    'Post healthcare jobs for free. No credit card, no sponsored-bid auction, no paywall to see applicants. Ava Health is where growing employers hire.',
  alternates: { canonical: 'https://freejobpost.co' },
  openGraph: {
    title: 'Free Healthcare Jobs. Post and Apply Free | Ava Health',
    description:
      'Post jobs free. Apply free. No auction fees, no paywall, no recruiter spam.',
    url: 'https://freejobpost.co',
    type: 'website',
  },
}

// ISR: 2026-05-28 bumped 300s → 3600s (1h). Cost audit — new jobs arrive
// only on the 4h ingest cron, so a 1h window keeps the live count + recent
// list fresh while cutting homepage regen 12×. See jobs/[slug] for the full
// ISR cost rationale.
export const revalidate = 21600

type RecentJob = Pick<PublicJob, 'id' | 'slug' | 'title' | 'city' | 'state' | 'salary_min' | 'salary_max'>

export default async function Home() {
  // Fetch live count + 6 most-recent active jobs + new-this-week count +
  // verified-employer count in parallel.
  //
  // Date.now() in a Server Component looks "impure" to React 19's strict
  // rule but is intentional here: this page revalidates hourly
  // (see `revalidate = 3600` above) so the "7 days ago" cutoff stays fresh
  // — it's not memoizable. Calling Date.now() inside the request scope of
  // an async Server Component is the documented way to get a real
  // wall-clock timestamp for ISR-sensitive queries.
  // eslint-disable-next-line react-hooks/purity
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const [countRes, recentRes, newThisWeekRes, verifiedEmpRes] = await Promise.all([
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', hourIso()),
    supabase
      .from('public_jobs')
      .select('id, slug, title, city, state, salary_min, salary_max')
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', hourIso())
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('public_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gt('expires_at', hourIso())
      .gte('created_at', sevenDaysAgo),
    // Exclude seeded inventory + ATS-imported employers (Greenhouse/Lever
    // public-feed pulls — we don't have an employer relationship) + any Ava
    // entity so the count reflects only employers who confirmed via domain
    // email. The badge only shows when > 0 so during cold-start it stays
    // hidden. company_name guard adds defence-in-depth.
    supabase
      .from('public_employers_directory')
      .select('id', { count: 'exact', head: true })
      .not('verified_at', 'is', null)
      .not('verified_via', 'in', '(seeded,ats_import)')
      .not('company_name', 'ilike', 'Ava Health%'),
  ])
  const liveCount = countRes.count ?? 0
  const recentJobs = (recentRes.data ?? []) as RecentJob[]
  const newThisWeek = newThisWeekRes.count ?? 0
  const verifiedEmployerCount = verifiedEmpRes.count ?? 0

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Logo size={32} className="shrink-0" />
            <span className="font-bold text-lg sm:text-xl tracking-tight text-[#003D5C]">Ava Health</span>
          </Link>
          <div className="flex items-center gap-4 md:gap-8 text-sm font-medium">
            <Link href="/jobs" className="hidden sm:inline hover:text-[#003D5C] whitespace-nowrap">Browse jobs</Link>
            <Link href="/how-it-works" className="hidden md:inline hover:text-[#003D5C]">How it works</Link>
            <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-[#003D5C]">For candidates</a>
            <Link href="/post-job" className="bg-[#7FBC00] text-white px-3 md:px-4 py-2 rounded-lg font-bold hover:bg-[#6DA300] transition-colors text-xs md:text-sm whitespace-nowrap">
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-32">
          <div className="inline-flex flex-wrap items-center gap-2 mb-8">
            <span className="inline-flex items-center gap-2 rounded-xl border border-gray-200 shadow-sm px-3 py-1 text-xs font-bold tracking-wider">
              <span className="w-2 h-2 bg-[#7FBC00] animate-pulse" />
              {liveCount > 0 ? (
                <>{liveCount.toLocaleString()} ACTIVE HEALTHCARE JOBS</>
              ) : (
                <>FREE HEALTHCARE JOB BOARD</>
              )}
            </span>
            {newThisWeek > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#7FBC00] text-white px-3 py-1 text-xs font-bold tracking-wider">
                +{newThisWeek.toLocaleString()} NEW THIS WEEK
              </span>
            )}
            {verifiedEmployerCount > 0 && (
              <span className="inline-flex items-center gap-1 border border-[#00B5D4] text-[#00B5D4] px-3 py-1 text-xs font-bold tracking-wider">
                {verifiedEmployerCount.toLocaleString()} VERIFIED EMPLOYER{verifiedEmployerCount === 1 ? '' : 'S'}
              </span>
            )}
          </div>
          <h1 className="text-[64px] md:text-[104px] font-black leading-[0.92] tracking-tight mb-8 text-[#003D5C]">
            Free healthcare
            <br />
            job posts.
          </h1>
          <p className="text-xl md:text-2xl max-w-2xl leading-snug mb-10 text-gray-800">
            Post RN, MD, PT, and front-desk roles in 60 seconds. Real applicants.
            Zero auction fees. Built by a staffing team that got tired of paying to be seen.
          </p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <Link
              href="/post-job"
              className="inline-flex items-center justify-center bg-[#7FBC00] text-white px-6 py-4 text-base font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
            >
              Post a job free →
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 shadow-sm px-6 py-4 text-base font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
            >
              Browse Jobs
            </Link>
            <a
              href="https://www.freeresumepost.co/upload?utm_source=freejobpost&utm_medium=referral&utm_campaign=careers_hero"
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 shadow-sm px-6 py-4 text-base font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
            >
              Upload your resume →
            </a>
          </div>
          <p className="mt-8 text-sm text-gray-600">
            Looking for work? Browse jobs free or post your resume and let employers come to you.
          </p>
        </div>
      </section>

      {/* Recently posted */}
      <section className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">OPEN ROLES</h2>
              <p className="text-4xl md:text-5xl font-black leading-tight tracking-tight text-[#003D5C]">
                Fresh healthcare jobs.
              </p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center font-bold border-b-2 border-[#003D5C] text-[#003D5C] hover:text-[#002A40] hover:border-[#002A40] pb-0.5"
            >
              View all →
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <div className="rounded-xl border border-gray-200 shadow-sm border-dashed py-16 text-center">
              <p className="text-2xl font-black mb-2 text-[#003D5C]">No jobs posted yet.</p>
              <p className="text-gray-700">
                Be the first.{' '}
                <Link href="/post-job" className="underline font-bold hover:text-[#003D5C]">
                  Post a job in 60 seconds &rarr;
                </Link>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 border-y border-gray-200">
              {recentJobs.map((job) => {
                const salary = formatSalary(job.salary_min, job.salary_max)
                const loc = locationLabel({ city: job.city, state: job.state })
                return (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.slug}`}
                    className="grid grid-cols-12 gap-4 py-5 hover:bg-green-50 transition-colors group"
                  >
                    <div className="col-span-12 md:col-span-7 font-bold group-hover:text-[#003D5C] truncate">
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

      {/* Browse by state + specialty — hub discovery for crawlers + users.
         Direct hub links (rather than only the index page) keep the
         depth-from-homepage = 1 for every popular hub, maximizing crawl
         frequency + authority flow. Pre-fix, all hubs were 2 clicks deep
         (homepage → /state → /state/florida) and the homepage was
         passing zero direct authority to per-state pages. */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">BROWSE BY STATE</h2>
              <p className="text-2xl font-black leading-tight mb-4 text-[#003D5C]">
                Every major US healthcare market.
              </p>
              <p className="text-gray-700 mb-5">
                {STATE_HUBS.length} state hubs, each with major-metro and top-employer breakouts.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {/* Top 12 state hubs by healthcare-market size — direct links
                   parented to homepage for max crawl-depth efficiency. */}
                {[
                  'florida', 'texas', 'california', 'new-york',
                  'illinois', 'pennsylvania', 'ohio', 'georgia',
                  'north-carolina', 'massachusetts', 'michigan', 'washington',
                ].map((slug) => {
                  const hub = STATE_HUBS.find((h) => h.slug === slug)
                  if (!hub) return null
                  return (
                    <Link
                      key={slug}
                      href={`/state/${slug}`}
                      className="text-sm rounded-md border border-gray-200 shadow-sm bg-white px-2.5 py-1 font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                    >
                      {hub.name}
                    </Link>
                  )
                })}
              </div>
              <Link
                href="/state"
                className="inline-flex items-center font-bold border-b-2 border-[#003D5C] text-[#003D5C] hover:text-[#002A40] hover:border-[#002A40] pb-0.5"
              >
                See all {STATE_HUBS.length} states →
              </Link>
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">BROWSE BY SPECIALTY</h2>
              <p className="text-2xl font-black leading-tight mb-4 text-[#003D5C]">
                {SPECIALTY_HUBS.length} healthcare specialties.
              </p>
              <p className="text-gray-700 mb-5">
                Cardiology, hospital medicine, EM, ortho, NP, PA, RN, CRNA, pharmacist. Active openings only.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {/* All specialty hubs — full set rendered to maximize 1-click
                   crawl depth from homepage to each hub. SPECIALTY_HUBS.length
                   currently 33; wraps cleanly even on narrow mobile widths.
                   If this grows past ~60 we should swap to a top-N + "see all"
                   pattern (same shape as the state row above), but at 33
                   chips the homepage stays scannable. */}
                {SPECIALTY_HUBS.map((hub) => (
                  <Link
                    key={hub.slug}
                    href={`/specialty/${hub.slug}`}
                    className="text-sm rounded-md border border-gray-200 shadow-sm bg-white px-2.5 py-1 font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                  >
                    {hub.title.replace(/ Jobs$/, '')}
                  </Link>
                ))}
              </div>
              <Link
                href="/specialty"
                className="inline-flex items-center font-bold border-b-2 border-[#003D5C] text-[#003D5C] hover:text-[#002A40] hover:border-[#002A40] pb-0.5"
              >
                See all specialties →
              </Link>
            </div>
          </div>

          {/* City row — third axis of long-tail SEO. Top 12 metros chosen
             by healthcare-market size (combined TMC, NYC, LA, Chicago,
             Boston, Philadelphia, SF, Houston-Dallas-Austin, Tampa-Miami). */}
          <div className="mt-12 pt-10 border-t border-gray-200">
            <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">BROWSE BY CITY</h2>
            <p className="text-2xl font-black leading-tight mb-4 text-[#003D5C]">
              Top US healthcare metros.
            </p>
            <p className="text-gray-700 mb-5 max-w-3xl">
              {CITY_HUBS.length} curated metros, each with major-employer breakouts. Tampa, NYC, Boston, LA, Houston, and more. Direct links to active openings.
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {[
                'houston-tx', 'new-york-ny', 'los-angeles-ca', 'chicago-il',
                'boston-ma', 'philadelphia-pa', 'tampa-fl', 'miami-fl',
                'dallas-tx', 'atlanta-ga', 'seattle-wa', 'denver-co',
              ].map((slug) => {
                const hub = CITY_HUBS.find((h) => h.slug === slug)
                if (!hub) return null
                return (
                  <Link
                    key={slug}
                    href={`/city/${slug}`}
                    className="text-sm rounded-md border border-gray-200 shadow-sm bg-white px-2.5 py-1 font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                  >
                    {hub.name.split(',')[0]}
                  </Link>
                )
              })}
            </div>
            <Link
              href="/city"
              className="inline-flex items-center font-bold border-b-2 border-[#003D5C] text-[#003D5C] hover:text-[#002A40] hover:border-[#002A40] pb-0.5"
            >
              See all {CITY_HUBS.length} cities →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-sm font-bold tracking-widest text-gray-600 mb-3">FAQ</h2>
          <p className="text-4xl md:text-5xl font-black leading-tight mb-12 tracking-tight text-[#003D5C]">
            Common questions, fast answers.
          </p>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">Is freejobpost.co really free?</h3>
              <p className="text-gray-700 leading-relaxed">Yes. No paywall, no per-applicant fee, no "sponsored" auction. We make money downstream when a placement converts on the matching engine. The job-posting side stays free forever.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">How long does a job stay live?</h3>
              <p className="text-gray-700 leading-relaxed">60 days by default. If a job expires and you still need it filled, posting it again takes about two minutes. Filled roles come off the board when you tell us.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">Where else does my job get distributed?</h3>
              <p className="text-gray-700 leading-relaxed">When you check the syndication boxes during posting, your listing gets JobPosting JSON-LD for Google for Jobs plus XML/RSS feeds for ZipRecruiter, Adzuna, Jooble, and other aggregators. Indeed and Glassdoor discover listings via crawl. No extra step needed. Active feed partners ingest within a few hours.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">Who&apos;s applying, real people or bots?</h3>
              <p className="text-gray-700 leading-relaxed">Real candidates. They either apply directly from the listing, or come through the <a href="https://www.freeresumepost.co" className="underline font-bold hover:text-[#003D5C]">freeresumepost.co</a> matching engine, where they&apos;ve uploaded their own resume. We don&apos;t scrape profiles or auto-apply.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">Do you charge for &quot;unlocking&quot; an applicant?</h3>
              <p className="text-gray-700 leading-relaxed">No. When a candidate applies, you get their full contact info immediately. No paywall, no &quot;contact unlock&quot; fees, no upgrade prompts.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">What healthcare roles can I post?</h3>
              <p className="text-gray-700 leading-relaxed">Physicians, NPs, PAs, RNs, CRNAs, LPNs, therapists (PT/OT/SLP/AuD), pharmacists, MAs, lab techs, sonographers, paramedics, and most allied roles. We focus on US healthcare staffing. Non-healthcare roles are out of scope.</p>
            </div>
            <div>
              <h3 className="text-xl font-black mb-2 text-[#003D5C]">How do candidates find my job?</h3>
              <p className="text-gray-700 leading-relaxed">Three paths. The freejobpost.co listing pages rank in search. The freeresumepost.co matching engine shows your role to candidates whose profile fits. And the syndication feeds carry your listing to aggregators. No extra steps on your end.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Big CTA */}
      <section className="border-b border-gray-200 bg-[#003D5C] text-white">
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
            className="inline-flex items-center bg-[#7FBC00] text-white px-8 py-5 text-lg font-black rounded-lg hover:bg-[#6DA300] transition-colors"
          >
            Post a job free →
          </Link>
        </div>
      </section>

</main>
  )
}
