import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase, hourIso } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  JOB_LIST_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import VerifiedEmployerBadge from '@/components/VerifiedEmployerBadge'
import { stripSalarySuffix } from '@/lib/clean-labels'
import { safeJsonLd } from '@/lib/safe-jsonld'
// The "Apply on employer site" CTA is a client component so it can read the
// ?ref=<partner> attribution param client-side. Keeping that read OUT of this
// server component is what lets /jobs/[slug] render as static ISR rather than
// dynamic-per-request — see ApplyExternalLink + the revalidate note below.
import ApplyExternalLink from '@/components/ApplyExternalLink'
import JobAlertCapture from '@/components/JobAlertCapture'
import ShareButtons from '@/components/ShareButtons'
import ResumeMatchCTA from '@/components/ResumeMatchCTA'
import AffiliateOffer from '@/components/AffiliateOffer'
// Hub-link helpers — drive the BROWSE MORE internal-linking section so
// per-job pages route PageRank back to the matching specialty / state
// hubs + employer page. Without these, /jobs/[slug] had zero links
// back into the category-page graph.
import { findSpecialtyHub } from '@/lib/specialty-slugs'
import { findStateHubByAbbr } from '@/lib/state-slugs'
import { findCityHub } from '@/lib/city-slugs'
import { buildJobPostingJsonLd } from '@/lib/job-posting-jsonld'
// Shared "is this description rich enough to INDEX?" check. The page noindex
// gate + JobPosting JSON-LD gate + sitemap.ts all use MIN_INDEXABLE_DESCRIPTION_CHARS
// (250, HTML-stripped) so a job page is never noindex'd while still listed in
// the sitemap. NOTE: this is the indexability bar, NOT the partner-feed quality
// bar — the /jobs.xml + per-partner feeds filter at the higher MIN_DESCRIPTION_CHARS
// (600). So a 250-599 char job IS indexable + carries JSON-LD, but is held back
// from aggregators. Pass the floor explicitly — hasUsableDescription's DEFAULT is
// the 600 feed bar, and relying on it here is exactly what noindexed ~10.9K pages
// on 2026-06-15.
import { hasUsableDescription, MIN_INDEXABLE_DESCRIPTION_CHARS } from '@/lib/feed-builders'
import { getViableCellsCached } from '@/lib/specialty-state-matrix'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'

type Props = {
  params: Promise<{ slug: string }>
}

// ISR window: 24h. Job content is STATIC after the 4h ingest cron writes it
// (the body never changes in place; jobs only get added — new slug = fresh
// first-render — or expire, filtered by getJob), so 24h is plenty fresh;
// Google's own recrawl cadence is multi-day anyway.
//
// 2026-05-28, two passes:
//   1. 600s → 86400s in the first ISR cost audit.
//   2. CRITICAL follow-up: that revalidate was a NO-OP. This page read
//      `searchParams` (?ref attribution) — a Next dynamic API — which forced
//      the entire 13.8K-page surface into DYNAMIC rendering. Every crawler hit
//      (Googlebot + Bing + the 14 partner feeds, walking the surface
//      continuously) re-rendered server-side with 3-6 DB queries, and the page
//      never entered the ISR cache. THAT was the dominant Vercel-invocation
//      cost. Fixed by moving the ?ref read into <ApplyExternalLink>
//      (client-side) so this page is static ISR again and 86400 takes effect.
//      (NB: the shared supabase client still pins a 300s fetch-revalidate that
//      caps this at 5m until raised — see lib/supabase.ts.)
export const revalidate = 86400
// A dynamic-param route ([slug]) with NO generateStaticParams defaults to
// per-request DYNAMIC rendering in Next 16 — which is what kept /jobs/[slug]
// uncached (Cache-Control: no-store) even after the searchParams removal, so
// the revalidate above did nothing and every crawler hit re-rendered. The page
// is now purely a function of the slug (no per-request inputs), so force it
// static: on-demand slugs render once and ISR-cache (dynamicParams stays true
// by default, so newly-ingested slugs still resolve + cache on first hit).
export const dynamic = 'force-static'

// Tight slug guard — lowercase, digits, hyphens only. Matches the DB slugify()
// output shape; anything else is a scraper/garbage URL and gets 404'd without
// hitting Supabase.
// Workday and some Greenhouse boards keep uppercase identifiers in their
// external IDs (e.g. "...-wd-R2654676"). buildAtsSlug() in the ATS-import
// edge function concatenates those as-is, so ~3,400 active job slugs have
// uppercase chars in production (verified 2026-05-19 across MGB, Saint
// Luke's, Stanford, Elevance, AdventHealth — all 4 Workday tenants except
// CCF which happens to use numeric-only external IDs).
//
// The prior `/^[a-z0-9]...$/` regex rejected those as malformed and 404'd
// every single one of them — meaning ~39% of our active inventory was
// unreachable from the /jobs listing's click-through. Allow uppercase so
// the slugs in the DB actually resolve.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,120}$/

type JobWithTargets = PublicJob & {
  syndication_targets?: string[] | null
  employer_id?: string | null
}

async function getJob(slug: string): Promise<JobWithTargets | null> {
  if (!SLUG_RE.test(slug)) return null
  // Defensive: if the syndication_targets column doesn't exist yet (pre-migration),
  // fall back to the original select so the page still renders.
  const withTargets = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', employer_id, syndication_targets')
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .maybeSingle()
  if (!withTargets.error) {
    return (withTargets.data as JobWithTargets | null) ?? null
  }
  const fallback = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', employer_id')
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .maybeSingle()
  // FAIL CLOSED (2026-06-02): if BOTH the targeted + fallback selects errored,
  // this is an infrastructure failure (bad grant / DB outage), NOT a missing row
  // — e.g. the company_name anon-grant incident, where every anon job query
  // 42501'd, getJob returned null → notFound() → a 404-storm across all ~16.8K
  // job pages. Throw so Next serves the last-good ISR cache (or 500s on a cold
  // cache, which a crawler retries) instead of 404'ing a real, live job. The
  // benign withTargets error (syndication_targets column missing) is recovered
  // by the fallback above; only a DOUBLE error reaches here. Build-phase guarded
  // so a prerender DB hiccup degrades gracefully. Mirrors /jobs + jobs.xml.
  if (fallback.error && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error(
      `getJob(${slug}): both selects failed (${fallback.error.message}) — refusing to 404 a real job`,
    )
  }
  return (fallback.data as JobWithTargets | null) ?? null
}

// Fetch a retired-but-not-deleted job by slug. When a listing comes down, the
// pipeline sets status='expired' and PRESERVES the row (deleted_at stays NULL;
// ~1,550 such rows live in the table) — getJob's `.eq('status','active')`
// filter then 404's it. Used ONLY as a fallback when getJob() returns null, to
// render a "position closed → see similar open jobs" recovery page (200,
// noindex) instead of a hard 404. deleted_at IS NULL is required so we never
// resurrect hard-removed rows (spam / employer takedown) — only legitimately
// retired listings that were once live and indexed.
async function getClosedJob(slug: string): Promise<JobWithTargets | null> {
  if (!SLUG_RE.test(slug)) return null
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS + ', employer_id')
    .eq('slug', slug)
    .eq('status', 'expired')
    .is('deleted_at', null)
    .maybeSingle()
  return (data as JobWithTargets | null) ?? null
}

// Lookup the hiring employer's display name + verification status. When the
// job has no employer_id (or the row is missing), fall back to the staffing-
// firm parent — those are the seeded roles placed by Ava Health Partners
// while we onboard direct employer postings.
//
// We also try to fetch slug + verified_via so the employer name can link to
// /employers/[slug] when available. The slug column is added via migration
// 2026-05-08_employer_slug.sql; before it runs, the query errors and we fall
// back gracefully (same pattern used for syndication_targets in getJob).
async function resolveEmployer(employerId: string | null | undefined): Promise<{
  name: string
  isSeeded: boolean
  verifiedAt: string | null
  slug: string | null
}> {
  const SEEDED_NAME = 'Ava Health Partners'
  if (!employerId) return { name: SEEDED_NAME, isSeeded: true, verifiedAt: null, slug: null }

  type EmployerFull = { company_name: string; verified_at: string | null; verified_via: string | null; slug: string | null }
  type EmployerBase = { company_name: string; verified_at: string | null }

  // Try with slug column (post-migration); fall back if column doesn't exist yet.
  const withSlug = await supabase
    .from('public_employers_directory')
    .select('company_name, verified_at, verified_via, slug')
    .eq('id', employerId)
    .maybeSingle()

  let row: EmployerFull | EmployerBase | null
  if (!withSlug.error) {
    row = (withSlug.data as EmployerFull | null)
  } else {
    const fallback = await supabase
      .from('public_employers_directory')
      .select('company_name, verified_at')
      .eq('id', employerId)
      .maybeSingle()
    row = (fallback.data as EmployerBase | null)
  }

  const name = row?.company_name?.trim() || SEEDED_NAME
  // Match "Ava Health Partners", "Ava Health Partners LLC", "Ava Health Partners — Seeded Roles", etc.
  const isSeeded = /^ava health partners\b/i.test(name)
  const full = row as EmployerFull | null
  // Provide a slug link only for real verified non-seeded, non-ATS-import
  // employers. ATS imports (verified_via='ats_import') don't have a public
  // employer landing page; their job-detail page links straight to the
  // employer's own apply URL.
  const slug = (!isSeeded && full?.slug && full?.verified_via !== 'seeded' && full?.verified_via !== 'ats_import') ? full.slug : null
  // Suppress the verified-employer green check badge for seeded inventory and
  // ATS imports. The /jobs index already gates the "VERIFIED ONLY" filter pill
  // on the same logic; this brings the per-job detail page in line so e.g.
  // 'U.S. Federal Government' (USAJobs ats_import) doesn't carry a verified
  // checkmark — we never confirmed that employer via domain email (S3/S7).
  const trustedVerify = full?.verified_via !== 'ats_import' && full?.verified_via !== 'seeded'
  const verifiedAt = (row?.verified_at && trustedVerify) ? row.verified_at : null
  return { name, isSeeded, verifiedAt, slug }
}

async function getRelated(job: PublicJob): Promise<PublicJob[]> {
  const { data } = await supabase
    .from('public_jobs')
    // The Related list only renders title / location / salary (see the render
    // below) — never the body. Select the lighter JOB_LIST_FIELDS instead of
    // JOB_DETAIL_FIELDS so we don't pull 6 full job descriptions per detail
    // page. 2026-05-29 over-fetch audit.
    .select(JOB_LIST_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .neq('id', job.id)
    .or(
      // Double-quote the values: role is free-text from /post-job, so a comma
      // ("Nurse, RN") or paren would otherwise break PostgREST's .or() grammar
      // — the comma is the term separator — silently erroring the query into an
      // empty Related list. Quoting lets the value contain commas/parens; strip
      // any embedded " or \ so the quoting itself stays intact. (Can't reuse
      // sanitizeQ here — this is an exact .eq match, so stripping chars would
      // stop it matching the stored row.) 2026-05-28 audit.
      [
        job.role ? `role.eq."${job.role.replace(/["\\]/g, '')}"` : null,
        job.state ? `state.eq."${job.state.replace(/["\\]/g, '')}"` : null,
      ]
        .filter(Boolean)
        .join(',') || 'id.neq.00000000-0000-0000-0000-000000000000'
    )
    .order('created_at', { ascending: false })
    .limit(6)
  return (data ?? []) as PublicJob[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const job = await getJob(slug)
  if (!job) {
    // Active listing gone — but if it's a legitimately-expired job (row still
    // present), serve closed-state metadata: noindex (drop the stale URL) but
    // follow (let Google walk the similar-job + hub links on the recovery page).
    const closed = await getClosedJob(slug)
    if (closed) {
      const cLoc = locationLabel(closed)
      const cTitle = stripSalarySuffix(closed.title) || closed.title
      return {
        title: `${cLoc ? `${cTitle} - ${cLoc}` : cTitle} (position closed)`,
        description: `This ${cTitle} position is no longer accepting applications. Browse similar open healthcare jobs on freejobpost.co.`,
        robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
      }
    }
    return {
      title: 'Job not found',
      robots: { index: false, follow: false },
    }
  }
  const loc = locationLabel(job)
  const cleanTitle = stripSalarySuffix(job.title) || job.title
  const title = loc ? `${cleanTitle} - ${loc}` : cleanTitle
  const desc = (job.description || '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 157)
    .trim()

  // 2026-05-27: thin-description noindex gate. ~6,085 Workday jobs (69% of
  // the Workday source) carry only the listing-endpoint preview (~150 chars)
  // until the backfill-workday-descriptions cron rehydrates them from the
  // detail endpoint. Serving those as indexable pages is thin content —
  // Google for Jobs rejects them and they drag the domain's quality signal.
  //
  // 2026-05-28: use the shared hasUsableDescription() helper (HTML-stripped),
  // pinned to the 250-char INDEXABLE floor (MIN_INDEXABLE_DESCRIPTION_CHARS) so
  // this gate matches the sitemap exactly and never noindexes a URL the sitemap
  // still submits. Pass the floor explicitly: the helper's default is the 600
  // partner-feed bar, and a 250-599 char job should stay indexable (just held
  // back from aggregators). The page serves 200 + follows internal links, so it
  // stays in the crawl graph; once the backfill rehydrates the description the
  // next revalidate (600s) flips it. Self-healing.
  const isThin = !hasUsableDescription(job.description, MIN_INDEXABLE_DESCRIPTION_CHARS)

  return {
    title,
    description: desc.length > 0 ? desc + (desc.length === 157 ? '...' : '') : title,
    alternates: { canonical: `https://freejobpost.co/jobs/${slug}` },
    ...(isThin ? { robots: { index: false, follow: true, googleBot: { index: false, follow: true } } } : {}),
    openGraph: {
      title,
      description: desc,
      url: `https://freejobpost.co/jobs/${slug}`,
      type: 'article',
    },
  }
}

// Render a minimal markdown-like description → HTML. Inputs come from the seed
// script, the ATS ingest, AND user-submitted /post-job descriptions. This is
// XSS-safe WITHOUT DOMPurify because it HTML-escapes & < > BEFORE applying the
// **bold** transform, so no raw user HTML can survive (a <script> becomes
// &lt;script&gt;). Switch to isomorphic-dompurify only if richer markup is ever
// allowed. (2026-05-29 audit: corrected the stale "seed-only" premise.)
function renderDescription(md: string): string {
  return md
    .split(/\n\n+/)
    .map((block) => {
      const html = block
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>')
      return `<p>${html}</p>`
    })
    .join('')
}

export default async function JobDetailPage({ params }: Props) {
  const { slug } = await params
  const job = await getJob(slug)
  if (!job) {
    // Recovery path: a hard 404 on an expired-but-previously-live job throws
    // away the inbound link equity AND dead-ends the visitor. If the row still
    // exists (expired, not deleted), render a noindex "position closed → see
    // similar open jobs" page (200) instead. The active-job render below is
    // completely untouched; this only changes what used to be a notFound().
    const closed = await getClosedJob(slug)
    if (!closed) notFound()
    const [closedRelated, closedEmployer] = await Promise.all([
      getRelated(closed),
      resolveEmployer(closed.employer_id),
    ])
    return (
      <ClosedJobView
        job={closed}
        related={closedRelated}
        employerName={closedEmployer.name}
      />
    )
  }

  const [related, employer, specialtyStateCells, citySpecialtyCells] = await Promise.all([
    getRelated(job),
    resolveEmployer(job.employer_id),
    // Cell sets used to validate BROWSE MORE matrix-link destinations
    // before rendering them — without this we'd link to /specialty/<x>/
    // <state> and /city/<slug>/<specialty> URLs that 404 because the
    // matrix-page route notFounds when the cell has <5 active matching
    // jobs. Both helpers are process-cached so successive jobs in the
    // same Next worker reuse the same fetch.
    getViableCellsCached(supabase),
    getViableCityCellsCached(supabase),
  ])
  const loc = locationLabel(job)
  const sal = formatSalary(job.salary_min, job.salary_max)
  const emp = employmentLabel(job.employment_type)
  const rem = remoteLabel(job.remote_hybrid)
  const datePosted = job.created_at?.split('T')[0]
  const validThrough = job.expires_at

  // stripSalarySuffix on title — defense against seeded rows where salary
  // or sign-on bonuses bled into the title field (e.g. "RN ICU - $18,900
  // Hiring Incentives"). Per feedback_candidate_pitch_rules.md, sign-on
  // bonus disclosure is banned. Description is left as-is — too risky to
  // mutate the body text; the DB-side cleanup is the right fix for that.
  const cleanJobTitle = stripSalarySuffix(job.title) || job.title
  // Build the JobPosting JSON-LD via the extracted helper. The helper
  // lives in src/lib/job-posting-jsonld.ts so it can be unit-tested
  // against Google's required-property list — a future regression to the
  // markup (e.g. accidentally dropping description, swapping the remote
  // location-block shape) gets caught by validateJobPostingJsonLd in the
  // build-time test suite instead of surfacing as a Search Console error
  // 1-7 days after deploy.
  const jobPostingJsonLd = buildJobPostingJsonLd({ job, employer })

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freejobpost.co' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://freejobpost.co/jobs' },
      {
        '@type': 'ListItem',
        position: 3,
        name: job.title,
        item: `https://freejobpost.co/jobs/${job.slug}`,
      },
    ],
  }

  // Only emit JobPosting JSON-LD if the recruiter opted into Google for Jobs
  // syndication. Breadcrumb is always safe to emit (it's about the page, not
  // the listing).
  //
  // Semantics: empty syndication_targets array means "no preference set"
  // (e.g., ATS-imported jobs are inserted with `ARRAY[]::text[]` by the
  // ats_import_upsert_jobs RPC), NOT "explicit opt-out from everything."
  // Pre-2026-05-20 audit: this check rejected 655 active jobs (6.8% of
  // inventory — every ATS row added since the 2026-05-20 backfill ran)
  // because `[].includes('google') === false`. Treat empty as "all opt-in"
  // to match the implied default; explicit opt-out requires a non-empty
  // array that lacks 'google'.
  const targets = job.syndication_targets
  const optedIntoGoogleByTargets =
    !targets || targets.length === 0 || targets.includes('google')

  // Google for Jobs rejects (and penalizes the whole feed for) JobPosting
  // entries with empty/thin descriptions. Some ATS-imported rows arrive
  // with no description body (provider returns only a title + apply URL).
  //
  // 2026-05-28: use the shared hasUsableDescription() helper (HTML-stripped) at
  // the 250-char INDEXABLE floor — the same gate as the noindex check above and
  // the sitemap. These two PAGE gates agree: thin (<250) = noindex + no
  // JobPosting JSON-LD; usable (>=250) = indexable + full JSON-LD. Partner-feed
  // syndication is now a SEPARATE, higher bar (600), so a 250-599 char job is
  // indexable + carries JSON-LD but is NOT in the aggregator feeds. Self-heals
  // when the Workday backfill rehydrates the description (next 600s revalidate).
  const descUsable = hasUsableDescription(job.description, MIN_INDEXABLE_DESCRIPTION_CHARS)
  const optedIntoGoogle = optedIntoGoogleByTargets && descUsable

  return (
    <>
      {optedIntoGoogle && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jobPostingJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <main className="min-h-screen bg-white text-black">
        {/* Nav */}
        <nav className="border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-lg sm:text-xl tracking-tight text-[#003D5C]">
                Ava Health
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hidden sm:inline hover:text-[#003D5C]">
                Browse jobs
              </Link>
              <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-[#003D5C]">
                For candidates
              </a>
              <Link
                href="/post-job"
                className="bg-[#7FBC00] text-white px-4 py-2 font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
              >
                Post a job →
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-10">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:text-[#003D5C]">
              Home
            </Link>
            <span className="mx-2">/</span>
            <Link href="/jobs" className="hover:text-[#003D5C]">
              Jobs
            </Link>
            <span className="mx-2">/</span>
            <span className="text-black">{cleanJobTitle}</span>
          </nav>

          {/* Header card */}
          <div className="rounded-xl border border-gray-200 shadow-sm p-6 md:p-8 mb-6">
            <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-3">
              {cleanJobTitle}
            </h1>
            {loc && <p className="text-lg text-gray-700 mb-4">{loc}</p>}

            <div className="flex flex-wrap gap-2 mb-6">
              {emp && (
                <span className="text-xs font-bold tracking-wider rounded-md border border-gray-200 px-2.5 py-1">
                  {emp.toUpperCase()}
                </span>
              )}
              {rem && (
                <span
                  className={`text-xs font-bold tracking-wider rounded-md border px-2.5 py-1 ${
                    rem === 'Remote'
                      ? 'bg-[#7FBC00] text-white border-[#7FBC00]'
                      : 'border-gray-200'
                  }`}
                >
                  {rem.toUpperCase()}
                </span>
              )}
              {sal && (
                <span className="text-xs font-bold tracking-wider bg-[#003D5C] text-white px-2.5 py-1">
                  {sal}
                </span>
              )}
              {job.specialty && job.specialty !== job.role && (
                <span className="text-xs font-bold tracking-wider rounded-md border border-gray-200 px-2.5 py-1">
                  {job.specialty.toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {job.apply_url ? (
                // Route every outbound apply click through /click/[slug] so we
                // can log per-partner attribution. The endpoint logs + 302s
                // to the real apply_url; failure modes still bounce the user
                // to a usable destination.
                <ApplyExternalLink
                  slug={job.slug}
                  className="inline-flex items-center justify-center bg-[#7FBC00] text-white px-6 py-4 text-base font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
                >
                  Apply on employer site →
                </ApplyExternalLink>
              ) : (
                <Link
                  href={`/jobs/${job.slug}/apply`}
                  className="inline-flex items-center justify-center bg-[#7FBC00] text-white px-6 py-4 text-base font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
                >
                  Apply for this role →
                </Link>
              )}
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 shadow-sm px-6 py-4 text-base font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
              >
                Browse all jobs
              </Link>
            </div>

            {/* High-intent affiliate: sits right by the apply CTA, where the
                reader is in "applying to a lot of jobs" mode. Renders nothing
                until the program link is configured (see lib/affiliates). */}
            <div className="mt-4">
              <AffiliateOffer program="jobcopilot" />
            </div>

            {/* Share — cheap distribution; the page already ships OG/Twitter cards. */}
            <div className="mt-4">
              <ShareButtons url={`https://freejobpost.co/jobs/${job.slug}`} title={cleanJobTitle} />
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-gray-200 shadow-sm p-6 md:p-8 mb-6">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 mb-4">
              ABOUT THIS ROLE
            </h2>
            <div
              className="job-content"
              dangerouslySetInnerHTML={{ __html: renderDescription(job.description || '') }}
            />
          </div>

          {/* Conversion bridge → freeresumepost.co. Placed right after the
              reader consumes the role — peak intent to "get matched to more
              like this" without re-applying. This is the candidate-supply
              funnel: freejob has the (growing) search traffic, freeresume
              needs the uploads. See ResumeMatchCTA. */}
          <div className="mb-6">
            <ResumeMatchCTA specialtyLabel={job.specialty || job.role} />
          </div>

          {/* Meta */}
          <div className="text-xs text-gray-500 mb-6 flex flex-wrap gap-x-6 gap-y-1">
            <span>
              Posted{' '}
              <time dateTime={datePosted}>
                {datePosted
                  ? new Date(datePosted).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      // datePosted is a UTC date (YYYY-MM-DD); format in UTC so
                      // the visible date can't drift a day behind the JSON-LD
                      // datePosted on a non-UTC runtime. 2026-05-28 audit.
                      timeZone: 'UTC',
                    })
                  : '—'}
              </time>
            </span>
            <span>
              Expires{' '}
              <time dateTime={validThrough}>
                {new Date(validThrough).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  // Format in UTC so the visible "Expires" date matches the
                  // JSON-LD validThrough (job.expires_at) regardless of the
                  // server runtime's timezone. 2026-05-28 audit.
                  timeZone: 'UTC',
                })}
              </time>
            </span>
            <span>
              Employer:{' '}
              {job.company_name ? (
                // Real per-job company (e.g. Adzuna's company.display_name): plain
                // text — no per-company page exists, and the joined employer
                // ("Adzuna (aggregator)") page wouldn't match this name.
                <span className="text-black font-medium">{job.company_name}</span>
              ) : employer.slug ? (
                <Link
                  href={`/employers/${employer.slug}`}
                  className="text-black font-medium underline underline-offset-2 hover:text-[#003D5C]"
                >
                  {employer.name}
                </Link>
              ) : (
                <span className="text-black font-medium">{employer.name}</span>
              )}
              {employer.verifiedAt && (
                <>
                  {' '}
                  <VerifiedEmployerBadge />
                </>
              )}
            </span>
          </div>

          {/* Seeded-role disclosure — honest signal that this is one of the
             roles placed by the staffing firm operating the site, while we
             onboard direct employer postings. Stays until cold-start ends. */}
          {employer.isSeeded && (
            <aside
              className="mb-10 border-2 border-dashed border-gray-400 p-4 text-xs leading-relaxed text-gray-700"
              aria-label="Sourcing disclosure"
            >
              <p className="font-bold tracking-wider text-gray-500 mb-1">
                ABOUT THIS LISTING
              </p>
              <p>
                This role is placed by{' '}
                <span className="font-medium">Ava Health Partners LLC</span>
                , the healthcare staffing firm that operates freejobpost.co. We
                seed real placements from our recruiter book while we onboard
                direct employer postings. Every listing has a real apply link
                and comes off the board once it is filled.
              </p>
            </aside>
          )}

          {/* Job-alert capture — last-chance conversion for the apply-leak:
              a visitor who read this role but won't click through to the
              employer ATS can still become a re-contactable CRM lead, tagged
              with this role's specialty + location. */}
          <div className="mb-10 max-w-3xl">
            <JobAlertCapture
              defaultSpecialty={stripSalarySuffix(job.specialty || '') || undefined}
              defaultState={job.state || undefined}
              defaultCity={job.city || undefined}
              source="job_page"
            />
          </div>

          {/* Browse more — internal links back to specialty / state hubs.
             Critical for SEO link-graph: per-job pages parented to the
             relevant category hub instead of being orphans. Each link
             resolves to a real, indexable, content-rich page (the hub
             passes authority back to other jobs in the cohort). */}
          {(() => {
            const specialtyHub = findSpecialtyHub(job.specialty, job.role, job.title)
            const stateHub = findStateHubByAbbr(job.state)
            const cityHub = findCityHub(job.city, job.state)
            const links: Array<{ href: string; label: string }> = []
            if (cityHub) {
              // City links carry more candidate intent than state links
              // for high-density metros — surface them first.
              links.push({
                href: `/city/${cityHub.slug}`,
                label: `Healthcare jobs in ${cityHub.name.split(',')[0]}`,
              })
            }
            if (specialtyHub) {
              links.push({
                href: `/specialty/${specialtyHub.slug}`,
                label: `More ${specialtyHub.title.replace(/ Jobs$/, '')} jobs`,
              })
            }
            if (stateHub) {
              links.push({
                href: `/state/${stateHub.slug}`,
                label: `Healthcare jobs in ${stateHub.name}`,
              })
            }
            // Matrix-cell links: only render when the cell actually
            // exists in the viable-cell set. The matrix routes
            // notFound() when zero jobs match (specialty-state/page.tsx
            // line 106, city-specialty/page.tsx line ~108) so linking
            // unconditionally produced live 404s — caught in the
            // 2026-05-22 audit pass on a Tampa PA job that linked
            // /specialty/physician-assistant/florida which doesn't
            // meet the ≥5-jobs floor.
            if (specialtyHub && stateHub) {
              const cellExists = specialtyStateCells.some(
                (c) => c.specialty.slug === specialtyHub.slug && c.state.slug === stateHub.slug
              )
              if (cellExists) {
                links.push({
                  href: `/specialty/${specialtyHub.slug}/${stateHub.slug}`,
                  label: `${specialtyHub.title.replace(/ Jobs$/, '')} in ${stateHub.name}`,
                })
              }
            }
            if (specialtyHub && cityHub) {
              const cellExists = citySpecialtyCells.some(
                (c) => c.specialty.slug === specialtyHub.slug && c.city.slug === cityHub.slug
              )
              if (cellExists) {
                links.push({
                  href: `/city/${cityHub.slug}/${specialtyHub.slug}`,
                  label: `${specialtyHub.title.replace(/ Jobs$/, '')} in ${cityHub.name.split(',')[0]}`,
                })
              }
            }
            // Federal source signal — usajobs:federal jobs link back to
            // /jobs/federal/<agency>. We can't infer the agency without the
            // raw source string parsed elsewhere, so just link to the
            // /jobs/federal index for any federal source.
            if (job.source?.startsWith('usajobs:')) {
              links.push({ href: '/jobs/federal', label: 'Federal healthcare jobs' })
            }
            if (links.length === 0) return null
            return (
              <section className="border-t border-gray-200 pt-10 mb-10">
                <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
                  BROWSE MORE
                </h2>
                <ul className="flex flex-wrap gap-3">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-block rounded-md border border-gray-200 shadow-sm px-3 py-2 text-sm font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                      >
                        {l.label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })()}

          {/* Related */}
          {related.length > 0 && (
            <section className="border-t border-gray-200 pt-10">
              <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
                RELATED ROLES
              </h2>
              <ul className="divide-y divide-gray-200 border-y border-gray-200">
                {related.map((r) => {
                  const rLoc = locationLabel(r)
                  const rSal = formatSalary(r.salary_min, r.salary_max)
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/jobs/${r.slug}`}
                        className="grid grid-cols-12 gap-4 py-4 hover:bg-green-50 transition-colors"
                      >
                        <div className="col-span-12 md:col-span-6 font-bold">{stripSalarySuffix(r.title) || r.title}</div>
                        <div className="col-span-6 md:col-span-4 text-gray-700 text-sm self-center">
                          {rLoc || '—'}
                        </div>
                        <div className="col-span-6 md:col-span-2 font-bold text-right text-sm self-center">
                          {rSal || ''}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </main>
    </>
  )
}

// ---------------------------------------------------------------------------
// Closed-job recovery view — rendered (HTTP 200, noindex via generateMetadata)
// when a slug resolves to an expired-but-not-deleted listing, instead of a hard
// 404. Keeps the visitor on-site (similar OPEN jobs + hub links) and lets
// Google drain the stale URL cleanly through the noindex while still following
// the internal links. Emits NO JobPosting JSON-LD on purpose — a closed role
// must never appear in the Google for Jobs feed.
// ---------------------------------------------------------------------------
function ClosedJobView({
  job,
  related,
  employerName,
}: {
  job: JobWithTargets
  related: PublicJob[]
  employerName: string
}) {
  const loc = locationLabel(job)
  const cleanJobTitle = stripSalarySuffix(job.title) || job.title
  const specialtyHub = findSpecialtyHub(job.specialty, job.role, job.title)
  const stateHub = findStateHubByAbbr(job.state)

  return (
    <main className="min-h-screen bg-white text-black">
      {/* Nav — identical to the active job page for visual continuity */}
      <nav className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-black text-lg sm:text-xl tracking-tight text-[#003D5C]">
              Ava Health
            </span>
          </Link>
          <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
            <Link href="/jobs" className="hidden sm:inline hover:text-[#003D5C]">
              Browse jobs
            </Link>
            <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-[#003D5C]">
              For candidates
            </a>
            <Link
              href="/post-job"
              className="bg-[#7FBC00] text-white px-4 py-2 font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
            >
              Post a job →
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-[#003D5C]">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/jobs" className="hover:text-[#003D5C]">
            Jobs
          </Link>
          <span className="mx-2">/</span>
          <span className="text-black">{cleanJobTitle}</span>
        </nav>

        {/* Closed banner */}
        <div className="rounded-xl border border-gray-200 shadow-sm p-6 md:p-8 mb-8">
          <span className="inline-block text-xs font-bold tracking-wider bg-[#003D5C] text-white px-2.5 py-1 mb-4">
            POSITION CLOSED
          </span>
          <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-3">
            {cleanJobTitle}
          </h1>
          {loc && <p className="text-lg text-gray-700 mb-1">{loc}</p>}
          {employerName && <p className="text-sm text-gray-500 mb-4">{employerName}</p>}
          <p className="text-gray-700 leading-relaxed mb-6 max-w-2xl">
            This role is no longer accepting applications. It&apos;s been filled or
            its posting window has ended. There are similar open healthcare jobs
            below, refreshed every few hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {specialtyHub && (
              <Link
                href={`/specialty/${specialtyHub.slug}`}
                className="inline-flex items-center justify-center bg-[#7FBC00] text-white px-6 py-4 text-base font-bold rounded-lg hover:bg-[#6DA300] transition-colors"
              >
                Browse {specialtyHub.title.replace(/ Jobs$/, '')} jobs →
              </Link>
            )}
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 shadow-sm px-6 py-4 text-base font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
            >
              Browse all jobs
            </Link>
          </div>
        </div>

        {/* Closed-job recovery bridge → freeresumepost.co — a dead listing is
            peak intent to "upload once, get matched to live roles" instead of
            chasing expired postings. */}
        <div className="mb-8">
          <ResumeMatchCTA specialtyLabel={job.specialty || job.role} />
        </div>

        {/* Similar open roles */}
        {related.length > 0 && (
          <section className="border-t border-gray-200 pt-10 mb-10">
            <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
              SIMILAR OPEN ROLES
            </h2>
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {related.map((r) => {
                const rLoc = locationLabel(r)
                const rSal = formatSalary(r.salary_min, r.salary_max)
                return (
                  <li key={r.id}>
                    <Link
                      href={`/jobs/${r.slug}`}
                      className="grid grid-cols-12 gap-4 py-4 hover:bg-green-50 transition-colors"
                    >
                      <div className="col-span-12 md:col-span-6 font-bold">{stripSalarySuffix(r.title) || r.title}</div>
                      <div className="col-span-6 md:col-span-4 text-gray-700 text-sm self-center">
                        {rLoc || '—'}
                      </div>
                      <div className="col-span-6 md:col-span-2 font-bold text-right text-sm self-center">
                        {rSal || ''}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* Hub links — route the visitor (and any equity) into the live hub graph */}
        {(specialtyHub || stateHub) && (
          <section className="border-t border-gray-200 pt-10">
            <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
              BROWSE MORE
            </h2>
            <ul className="flex flex-wrap gap-3">
              {specialtyHub && (
                <li>
                  <Link
                    href={`/specialty/${specialtyHub.slug}`}
                    className="inline-block rounded-md border border-gray-200 shadow-sm px-3 py-2 text-sm font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                  >
                    More {specialtyHub.title.replace(/ Jobs$/, '')} jobs →
                  </Link>
                </li>
              )}
              {stateHub && (
                <li>
                  <Link
                    href={`/state/${stateHub.slug}`}
                    className="inline-block rounded-md border border-gray-200 shadow-sm px-3 py-2 text-sm font-bold hover:bg-[#003D5C] hover:text-white transition-colors"
                  >
                    Healthcare jobs in {stateHub.name} →
                  </Link>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
