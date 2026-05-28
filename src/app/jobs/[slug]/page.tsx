import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import {
  JOB_DETAIL_FIELDS,
  type PublicJob,
  formatSalary,
  employmentLabel,
  remoteLabel,
  locationLabel,
} from '@/lib/public-jobs'
import VerifiedEmployerBadge from '@/components/VerifiedEmployerBadge'
import { stripSalarySuffix } from '@/lib/clean-labels'
import { safeJsonLd } from '@/lib/safe-jsonld'
// Partner-attribution allowlist + normalizer live in
// src/lib/partner-attribution.ts (shared with /jobs.xml). Anything outside
// the known set collapses to 'internal' so a malicious ?ref doesn't
// pollute apply_clicks.
import { normalizePartner } from '@/lib/partner-attribution'
// Hub-link helpers — drive the BROWSE MORE internal-linking section so
// per-job pages route PageRank back to the matching specialty / state
// hubs + employer page. Without these, /jobs/[slug] had zero links
// back into the category-page graph.
import { findSpecialtyHub } from '@/lib/specialty-slugs'
import { findStateHubByAbbr } from '@/lib/state-slugs'
import { findCityHub } from '@/lib/city-slugs'
import { buildJobPostingJsonLd } from '@/lib/job-posting-jsonld'
// Shared "is this description rich enough to index / syndicate?" check.
// Single source of truth (MIN_DESCRIPTION_CHARS=250, HTML-stripped) so the
// /jobs/[slug] noindex gate + JobPosting JSON-LD gate stay aligned with the
// /jobs.xml + per-partner feed filters. Avoids the split where a 250-299
// char job appears in the Google-for-Jobs feed but is noindex'd on its
// own landing page.
import { hasUsableDescription } from '@/lib/feed-builders'
import { getViableCellsCached } from '@/lib/specialty-state-matrix'
import { getViableCityCellsCached } from '@/lib/city-specialty-matrix'

type Props = {
  params: Promise<{ slug: string }>
  // ?ref=<partner> attribution carried from publisher feeds (Indeed,
  // Talent.com, Adzuna, etc.) lets us tag the apply-click that follows.
  // Defaults to 'internal' when absent (visitors who land via Google / SEO).
  searchParams?: Promise<{ ref?: string }>
}

export const revalidate = 600

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
    .gt('expires_at', new Date().toISOString())
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
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (fallback.data as JobWithTargets | null) ?? null
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
    .select(JOB_DETAIL_FIELDS)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .neq('id', job.id)
    .or(
      [
        job.role ? `role.eq.${job.role}` : null,
        job.state ? `state.eq.${job.state}` : null,
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
    return {
      title: 'Job not found',
      robots: { index: false, follow: false },
    }
  }
  const loc = locationLabel(job)
  const cleanTitle = stripSalarySuffix(job.title) || job.title
  const title = loc ? `${cleanTitle} — ${loc}` : cleanTitle
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
  // 2026-05-28: use the shared hasUsableDescription() helper (250-char,
  // HTML-stripped) so this gate matches the /jobs.xml + per-partner feed
  // filters exactly. Previously a raw `length < 300` check, which could
  // disagree with the feed's 250-char filter — a 250-299 char job would
  // ship in the Google-for-Jobs feed but be noindex'd on its landing page.
  // The page still serves 200 + follows internal links, so it stays in the
  // crawl graph; once the backfill rehydrates the description the next
  // revalidate (600s) flips it back to indexable. Self-healing.
  const isThin = !hasUsableDescription(job.description)

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

// Render a minimal markdown-like description → HTML. The seed script writes
// **Label:** value lines and plain paragraphs separated by blank lines.
// Keeping this in-file (no DOMPurify dep) because the content comes from our
// own seed script, not user submissions. When /post-job ships with user-
// provided descriptions, we'll switch to isomorphic-dompurify.
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

export default async function JobDetailPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const partner = normalizePartner(sp.ref)
  const job = await getJob(slug)
  if (!job) notFound()

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
  // 2026-05-28: use the shared hasUsableDescription() helper (250-char,
  // HTML-stripped) — the same gate as the noindex check above and the
  // /jobs.xml feed filter. All three now agree exactly: thin = noindex +
  // no JobPosting JSON-LD + excluded from partner feeds; usable = indexable
  // + full markup + syndicated. Self-heals when the Workday backfill
  // rehydrates the description (next 600s revalidate flips all three).
  const descUsable = hasUsableDescription(job.description)
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
        <nav className="border-b-2 border-black">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-black text-xl tracking-tight">
                freejobpost<span className="text-green-700">.co</span>
              </span>
              <span className="text-[10px] font-bold tracking-wider border border-black px-1.5 py-0.5">
                BETA
              </span>
            </Link>
            <div className="flex items-center gap-3 md:gap-8 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700">
                Browse jobs
              </Link>
              <a href="https://www.freeresumepost.co" className="hidden md:inline hover:text-green-700">
                For candidates
              </a>
              <Link
                href="/post-job"
                className="bg-black text-white px-4 py-2 font-bold hover:bg-green-700 transition-colors"
              >
                Post a job →
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-10">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-gray-500 mb-6">
            <Link href="/" className="hover:text-green-700">
              Home
            </Link>
            <span className="mx-2">/</span>
            <Link href="/jobs" className="hover:text-green-700">
              Jobs
            </Link>
            <span className="mx-2">/</span>
            <span className="text-black">{cleanJobTitle}</span>
          </nav>

          {/* Header card */}
          <div className="border-2 border-black p-6 md:p-8 mb-6">
            <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-3">
              {cleanJobTitle}
            </h1>
            {loc && <p className="text-lg text-gray-700 mb-4">{loc}</p>}

            <div className="flex flex-wrap gap-2 mb-6">
              {emp && (
                <span className="text-xs font-bold tracking-wider border-2 border-black px-2.5 py-1">
                  {emp.toUpperCase()}
                </span>
              )}
              {rem && (
                <span
                  className={`text-xs font-bold tracking-wider border-2 px-2.5 py-1 ${
                    rem === 'Remote'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-black'
                  }`}
                >
                  {rem.toUpperCase()}
                </span>
              )}
              {sal && (
                <span className="text-xs font-bold tracking-wider bg-black text-white px-2.5 py-1">
                  {sal}
                </span>
              )}
              {job.specialty && job.specialty !== job.role && (
                <span className="text-xs font-bold tracking-wider border-2 border-black px-2.5 py-1">
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
                <a
                  href={`/click/${job.slug}?p=${encodeURIComponent(partner)}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center justify-center bg-black text-white px-6 py-4 text-base font-bold hover:bg-green-700 transition-colors"
                >
                  Apply on employer site →
                </a>
              ) : (
                <Link
                  href={`/jobs/${job.slug}/apply`}
                  className="inline-flex items-center justify-center bg-black text-white px-6 py-4 text-base font-bold hover:bg-green-700 transition-colors"
                >
                  Apply for this role →
                </Link>
              )}
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center border-2 border-black px-6 py-4 text-base font-bold hover:bg-black hover:text-white transition-colors"
              >
                Browse all jobs
              </Link>
            </div>
          </div>

          {/* Description */}
          <div className="border-2 border-black p-6 md:p-8 mb-6">
            <h2 className="text-xs font-bold tracking-widest text-gray-500 mb-4">
              ABOUT THIS ROLE
            </h2>
            <div
              className="job-content"
              dangerouslySetInnerHTML={{ __html: renderDescription(job.description || '') }}
            />
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
                })}
              </time>
            </span>
            <span>
              Employer:{' '}
              {employer.slug ? (
                <Link
                  href={`/employers/${employer.slug}`}
                  className="text-black font-medium underline underline-offset-2 hover:text-green-700"
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
                <a
                  href="https://avahealth.co"
                  className="underline hover:text-green-700"
                  rel="noopener"
                >
                  Ava Health Partners LLC
                </a>
                , the healthcare staffing firm that operates freejobpost.co. We
                seed real placements from our recruiter book while we onboard
                direct employer postings — every listing has a real apply link
                and goes off the board within 15 minutes of being filled.
              </p>
            </aside>
          )}

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
              <section className="border-t-2 border-black pt-10 mb-10">
                <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
                  BROWSE MORE
                </h2>
                <ul className="flex flex-wrap gap-3">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="inline-block border-2 border-black px-3 py-2 text-sm font-bold hover:bg-black hover:text-white transition-colors"
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
            <section className="border-t-2 border-black pt-10">
              <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-4">
                RELATED ROLES
              </h2>
              <ul className="divide-y-2 divide-black border-y-2 border-black">
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
