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
  mapToSchemaEmploymentType,
} from '@/lib/public-jobs'

type Props = { params: Promise<{ slug: string }> }

export const revalidate = 600

// Tight slug guard — lowercase, digits, hyphens only. Matches the DB slugify()
// output shape; anything else is a scraper/garbage URL and gets 404'd without
// hitting Supabase.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/

async function getJob(slug: string): Promise<PublicJob | null> {
  if (!SLUG_RE.test(slug)) return null
  const { data } = await supabase
    .from('public_jobs')
    .select(JOB_DETAIL_FIELDS)
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return (data as PublicJob | null) ?? null
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
  const title = loc ? `${job.title} — ${loc}` : job.title
  const desc = (job.description || '')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .slice(0, 157)
    .trim()
  return {
    title,
    description: desc.length > 0 ? desc + (desc.length === 157 ? '...' : '') : title,
    alternates: { canonical: `https://freejobpost.co/jobs/${slug}` },
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

export default async function JobDetailPage({ params }: Props) {
  const { slug } = await params
  const job = await getJob(slug)
  if (!job) notFound()

  const related = await getRelated(job)
  const loc = locationLabel(job)
  const sal = formatSalary(job.salary_min, job.salary_max)
  const emp = employmentLabel(job.employment_type)
  const rem = remoteLabel(job.remote_hybrid)
  const datePosted = job.created_at?.split('T')[0]
  const validThrough = job.expires_at

  const jobPostingJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted,
    validThrough,
    identifier: {
      '@type': 'PropertyValue',
      name: 'freejobpost.co',
      value: job.slug,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Ava Health Partners',
      sameAs: 'https://avahealth.co',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || undefined,
        addressRegion: job.state || undefined,
        addressCountry: 'US',
      },
    },
    employmentType: mapToSchemaEmploymentType(job.employment_type),
    url: `https://freejobpost.co/jobs/${job.slug}`,
    directApply: false,
    ...(job.salary_min || job.salary_max
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'USD',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salary_min ?? undefined,
              maxValue: job.salary_max ?? undefined,
              unitText: 'YEAR',
            },
          },
        }
      : {}),
    ...(job.remote_hybrid === 'remote' ? { jobLocationType: 'TELECOMMUTE' } : {}),
  }

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
            <div className="hidden md:flex items-center gap-8 text-sm font-medium">
              <Link href="/jobs" className="hover:text-green-700">
                Browse jobs
              </Link>
              <a href="https://freeresumepost.co" className="hover:text-green-700">
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
            <span className="text-black">{job.title}</span>
          </nav>

          {/* Header card */}
          <div className="border-2 border-black p-6 md:p-8 mb-6">
            <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight mb-3">
              {job.title}
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
                <a
                  href={job.apply_url}
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
          <div className="text-xs text-gray-500 mb-10 flex flex-wrap gap-x-6 gap-y-1">
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
          </div>

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
                        <div className="col-span-12 md:col-span-6 font-bold">{r.title}</div>
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
