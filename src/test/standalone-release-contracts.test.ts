import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { metadata as homeMetadata } from '../app/page'

const repositoryRoot = resolve(process.cwd())

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!['.css', '.svg', '.ts', '.tsx'].includes(extname(entry.name))) return []
    if (entry.name.includes('.test.')) return []
    return [path]
  })
}

describe('standalone FreeJobPost release contracts', () => {
  it('describes automatic feed assignment accurately', () => {
    const feeds = read('src/app/feeds/page.tsx')
    expect(feeds).toContain('added to active default feeds automatically')
    expect(feeds).toContain('no current job is eligible')
    expect(feeds).not.toContain('per-network opt-in checkboxes')
    expect(feeds).not.toContain('employer opted into')
  })

  it('keeps internal partner operations out of the public feed page', () => {
    const feeds = read('src/app/feeds/page.tsx')
    expect(feeds).not.toContain('PARTNER_CONTACTS')
    expect(feeds).not.toContain('bouncedAddresses')
    expect(feeds).not.toContain('lastVerifiedAt')
    expect(feeds).not.toContain('Channel verified')
  })

  it('renders exactly one inventory-aware empty state', () => {
    const filter = read('src/app/jobs/jobs-filter.tsx')
    const page = read('src/app/jobs/page.tsx')
    expect(filter.match(/No open jobs yet\./g)).toHaveLength(1)
    expect(filter).toContain('No jobs match that search.')
    expect(filter).toContain('hasActiveQuery')
    expect(page).not.toContain('No open jobs yet.')
  })

  it('only claims and links to related closed-job inventory when it exists', () => {
    const closedJob = read('src/app/jobs/[slug]/page.tsx')
    expect(closedJob).toContain("related.length > 0")
    expect(closedJob).toContain("There are no similar open roles listed right now.")
    expect(closedJob).toContain('relatedSpecialtyHub')
    expect(closedJob).toContain('relatedStateHub')
    expect(closedJob).not.toContain(
      'There are similar open healthcare jobs below, refreshed every few hours.',
    )
  })

  it('returns a real 404 for every retired federal route', () => {
    const federalRoutes = [
      'src/app/jobs/federal/page.tsx',
      'src/app/jobs/federal/[agency]/page.tsx',
      'src/app/jobs/federal/[agency]/p/[page]/page.tsx',
      'src/app/jobs/federal/[agency]/[state]/page.tsx',
      'src/app/jobs/federal/[agency]/[state]/p/[page]/page.tsx',
    ]
    for (const route of federalRoutes) {
      expect(read(route), route).toContain('notFound()')
      expect(read(route), route).not.toContain('permanentRedirect')
    }
  })

  it('retires matrix routes to their closest surviving parent', () => {
    expect(read('src/app/city/[slug]/[specialty]/page.tsx')).toContain(
      'permanentRedirect(`/city/${encodeURIComponent(slug)}`)',
    )
    for (const route of [
      'src/app/specialty/[slug]/[state]/page.tsx',
      'src/app/specialty/[slug]/[state]/p/[page]/page.tsx',
    ]) {
      expect(read(route), route).toContain(
        'permanentRedirect(`/specialty/${encodeURIComponent(slug)}`)',
      )
    }
    expect(read('src/app/changelog/page.tsx')).toContain('notFound()')
  })

  it('uses only the current standalone palette throughout production source', () => {
    const legacyTokens = [
      '#003D5C',
      '#7FBC00',
      '#00B5D4',
      '#6DA300',
      '#002A40',
      '#1f523a',
      '#1f563b',
    ]
    for (const file of sourceFiles(resolve(repositoryRoot, 'src'))) {
      const contents = readFileSync(file, 'utf8')
      for (const token of legacyTokens) {
        expect(contents, `${file} contains ${token}`).not.toContain(token)
      }
    }
  })

  it('keeps public and active mail source free of Ava mailboxes', () => {
    const activeMailPaths = [
      'src/app/e-verify/page.tsx',
      'src/app/employer/dashboard.tsx',
      'src/app/employer/login/login-form.tsx',
      'src/app/error.tsx',
      'src/app/feeds/page.tsx',
      'src/app/layout.tsx',
      'src/app/post-job/actions.ts',
      'src/app/post-job/post-job-form.tsx',
      'src/app/privacy/page.tsx',
      'src/app/terms/page.tsx',
      'src/lib/organization-schema.ts',
      'supabase/functions/_shared/resend-send.ts',
      'supabase/functions/apply-notify/index.ts',
      'supabase/functions/employer-login-send/index.ts',
      'supabase/functions/job-alert-digest/index.ts',
      'supabase/functions/post-job-send-verify/index.ts',
      'supabase/functions/post-job-verify/index.ts',
    ]
    for (const path of activeMailPaths) {
      expect(read(path), path).not.toMatch(/@avahealth\.co/i)
    }
  })

  it('keeps verification and login mail on product-owned sender paths', () => {
    const loginAction = read('src/app/employer/login/actions.ts')
    const postAction = read('src/app/post-job/actions.ts')
    const emailConfig = read('supabase/functions/_shared/freejobpost-email.ts')
    const envExample = read('.env.example')

    expect(loginAction).toContain('/functions/v1/employer-login-send')
    expect(postAction).toContain('/functions/v1/post-job-send-verify')
    expect(loginAction).not.toContain('signInWithOtp')
    expect(postAction).not.toContain('signInWithOtp')
    expect(emailConfig).toContain('FREEJOBPOST_FROM_EMAIL')
    expect(emailConfig).toContain('FREEJOBPOST_REPLY_TO_EMAIL')
    expect(emailConfig).toContain('domain === "freejobpost.co"')
    expect(envExample).toContain('FREEJOBPOST_FROM_EMAIL')
    expect(envExample).toContain('FREEJOBPOST_REPLY_TO_EMAIL')

    for (const path of [
      'supabase/functions/employer-login-send/index.ts',
      'supabase/functions/post-job-send-verify/index.ts',
      'supabase/functions/post-job-verify/index.ts',
      'supabase/functions/apply-notify/index.ts',
      'supabase/functions/job-alert-digest/index.ts',
    ]) {
      const contents = read(path)
      expect(contents, path).toContain('readFreeJobPostEmailConfig')
      expect(contents, path).not.toMatch(/@avahealth\.co|Ava Health/i)
    }
  })

  it('keeps product identity surfaces separate from the legal operator', () => {
    const identityPaths = [
      'public/llms.txt',
      'src/app/layout.tsx',
      'src/lib/organization-schema.ts',
      'src/app/feeds/page.tsx',
      'src/app/feeds/linkedin.xml/route.ts',
      'src/app/jobs.xml/route.ts',
      'src/lib/feed-builders.ts',
      'supabase/functions/apply-notify/index.ts',
      'supabase/functions/employer-login-send/index.ts',
      'supabase/functions/job-alert-digest/index.ts',
      'supabase/functions/post-job-send-verify/index.ts',
      'supabase/functions/post-job-verify/index.ts',
    ]
    for (const path of identityPaths) {
      const contents = read(path)
      expect(contents, path).not.toMatch(/ava health/i)
      expect(contents, path).not.toMatch(/providers\.avahealth\.co|app\.avahealth\.co/i)
    }
  })

  it('connects FreeResumePost through approved navigation surfaces only', () => {
    const siblingUrl = 'https://www.freeresumepost.co'
    const siblingSourcePaths = [
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/components/HealthcareToolsNav.tsx',
    ]

    for (const path of siblingSourcePaths) {
      expect(read(path), path).toContain(siblingUrl)
    }
    expect(read('public/llms.txt')).toContain(siblingUrl)
    expect(read('src/components/HealthcareToolsNav.tsx')).toContain(
      'aria-label="Healthcare hiring tools"',
    )
    expect(read('src/components/HealthcareToolsNav.tsx')).toContain(
      'FreeResumePost',
    )
    expect(read('src/components/HealthcareToolsNav.tsx')).toContain('min-h-11')

    for (const file of sourceFiles(resolve(repositoryRoot, 'src'))) {
      if (!readFileSync(file, 'utf8').includes('freeresumepost.co')) continue
      const path = relative(repositoryRoot, file).replaceAll('\\', '/')
      expect(siblingSourcePaths, path).toContain(path)
    }
  })

  it('pins the standalone job product metadata and public positioning', () => {
    const layout = read('src/app/layout.tsx')
    const home = read('src/app/page.tsx')
    const manifest = read('src/app/manifest.ts')

    expect(layout).toContain("applicationName: 'FreeJobPost'")
    expect(layout).toContain("metadataBase: new URL('https://freejobpost.co')")
    expect(layout).toContain("siteName: 'FreeJobPost'")
    expect(homeMetadata.alternates).toMatchObject({
      canonical: 'https://freejobpost.co',
      types: {
        'application/rss+xml': [
          {
            url: '/feeds/rss.xml',
            title: 'FreeJobPost nursing and allied health jobs',
          },
        ],
      },
    })
    expect(homeMetadata.openGraph).toMatchObject({
      siteName: 'FreeJobPost',
      locale: 'en_US',
      type: 'website',
      url: 'https://freejobpost.co',
    })
    expect(home).toContain('roles posted directly by employers')
    expect(manifest).toContain("name: 'FreeJobPost'")
    expect(manifest).toContain("src: '/icon.svg'")
    expect(manifest).toContain("src: '/apple-icon'")
    expect(manifest).not.toContain("src: '/icon'")
    expect(manifest).toContain("src: '/icon-512'")
    expect(read('src/app/icon-512/route.tsx')).toContain("contentType = 'image/png'")
    expect(read('src/app/apple-icon.tsx')).toContain("contentType = 'image/png'")
    expect(existsSync(resolve(repositoryRoot, 'src/app/apple-icon.svg'))).toBe(false)
    expect(read('next.config.ts')).toContain(
      "has: [{ type: 'host', value: 'www.freejobpost.co' }]",
    )
    expect(read('next.config.ts')).toContain(
      "destination: 'https://freejobpost.co/:path*'",
    )
    expect(read('next.config.ts')).toContain("destination: '/icon.svg'")

    for (const path of [
      'src/app/layout.tsx',
      'src/app/page.tsx',
      'src/app/how-it-works/page.tsx',
      'src/app/post-job/page.tsx',
      'src/components/SiteHeader.tsx',
      'src/components/HealthcareToolsNav.tsx',
      'src/app/manifest.ts',
      'public/llms.txt',
    ]) {
      expect(read(path), path).not.toMatch(
        /Ava Health|avahealth\.co|provider staffing|placement fee|matching engine|our recruiters|recruiter matching|\brecruiters?\b|48,696|aggregated jobs|syndicate everywhere/i,
      )
    }
  })

  it('excludes internal operator inventory from every public job query', () => {
    expect(read('src/lib/public-jobs.ts')).toContain(
      "PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN = 'Ava Health%'",
    )
    const publicQueryPaths = [
      'src/app/api/jobs/search/route.ts',
      'src/app/click/[slug]/route.ts',
      'src/app/feeds/linkedin.xml/route.ts',
      'src/app/feeds/rss.xml/route.ts',
      'src/app/feeds/specialty/[slug]/route.ts',
      'src/app/feeds/state/[slug]/route.ts',
      'src/app/jobs.xml/route.ts',
      'src/app/jobs/[slug]/apply/actions.ts',
      'src/app/jobs/[slug]/apply/page.tsx',
      'src/app/jobs/[slug]/opengraph-image.tsx',
      'src/app/jobs/[slug]/page.tsx',
      'src/app/jobs/page.tsx',
      'src/app/specialty/[slug]/page.tsx',
      'src/app/state/[slug]/page.tsx',
      'src/lib/active-batch-count.ts',
      'src/lib/feed-builders.ts',
      'src/lib/hub-job-queries.ts',
      'src/lib/sitemap-chunks.ts',
    ]
    for (const path of publicQueryPaths) {
      const contents = read(path)
      const sourceFilters = contents.match(/\.eq\('source', PUBLIC_EMPLOYER_JOB_SOURCE\)/g) ?? []
      const companyFilters =
        contents.match(
          /\.not\('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN\)/g,
        ) ?? []
      expect(companyFilters.length, path).toBeGreaterThanOrEqual(sourceFilters.length)
    }
    expect(read('src/lib/hub-page-counts.ts')).toContain(
      ".not('company_name', 'ilike', PUBLIC_JOB_EXCLUDED_COMPANY_PATTERN)",
    )
  })

  it('keeps the legal E-Verify record outside the indexed product surface', () => {
    const page = read('src/app/e-verify/page.tsx')
    const sitemap = read('src/lib/sitemap-chunks.ts')
    const nextConfig = read('next.config.ts')
    expect(page).toContain('robots: { index: false, follow: false }')
    expect(sitemap).not.toContain('`${base}/e-verify`')
    expect(nextConfig).toContain("source: '/e-verify'")
    expect(nextConfig).toContain("value: 'noindex, nofollow'")
  })

  it('retires aggregate function deployment sources without database access', () => {
    for (const [path, functionName] of [
      ['supabase/functions/refresh-ats-imports/index.ts', 'refresh-ats-imports'],
      ['supabase/functions/adzuna-ingest/index.ts', 'adzuna-ingest'],
      [
        'supabase/functions/backfill-workday-descriptions/index.ts',
        'backfill-workday-descriptions',
      ],
    ]) {
      const contents = read(path)
      expect(contents, path).toContain(`retiredFunctionResponse("${functionName}")`)
      expect(contents, path).not.toMatch(/createClient|\.from\(|\.rpc\(|fetch\(/)
    }
  })

  it('holds a reversible database retirement source outside active migrations', () => {
    const migration = read(
      'supabase/migration-sources/held/20260829193000_retire_legacy_aggregation_and_ava_bridges.sql',
    )
    expect(migration).toContain('HELD SOURCE ONLY')
    expect(migration).toContain('refresh-ats-imports-every-4h')
    expect(migration).toContain('adzuna-ingest-every-4h')
    expect(migration).toContain('backfill-workday-descriptions-every-4h')
    expect(migration).toContain("'refresh_marketplace_matches'")
    expect(migration).toContain("'cross_site_create_candidate_profile'")
    expect(migration).toContain("'cross_site_revoke_candidate_profile'")
    expect(migration).toContain('REVOKE ALL ON FUNCTION')
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.public_/i)
    expect(migration).not.toMatch(/TRUNCATE\s+/i)
  })

  it('uses verification language instead of managed review language', () => {
    expect(read('src/app/post-job/page.tsx')).toContain('Your verified job appears')
    expect(read('src/app/how-it-works/page.tsx')).toContain('Your verified post then goes live')
    const dashboard = read('src/app/employer/dashboard.tsx')
    expect(dashboard).toContain("pending_review: 'AWAITING VERIFICATION'")
    const form = read('src/app/post-job/post-job-form.tsx')
    expect(form).not.toMatch(/verify your listing by hand|activate your listing manually/i)
  })

  it('uses the shared safe apply URL policy in both redirect flows', () => {
    const nativeApply = read('src/app/jobs/[slug]/apply/page.tsx')
    const trackedClick = read('src/app/click/[slug]/route.ts')
    expect(nativeApply).toContain(
      "safeApplyUrl(job.apply_url, { requireHttps: true })",
    )
    expect(trackedClick).toContain(
      "safeApplyUrl(job.apply_url, { requireHttps: true })",
    )
    expect(nativeApply).not.toContain('new URL(job.apply_url)')
    expect(trackedClick).not.toContain('function safeApplyUrl')
  })

  it('requires HTTPS before a public employer job reaches the database RPC', () => {
    const action = read('src/app/post-job/actions.ts')

    expect(action).toContain(
      'safeApplyUrl(normalized.apply_url, { requireHttps: true })',
    )
    expect(action).toContain("sb.rpc('submit_freejobpost_job_rpc'")
    expect(action).not.toContain("sb.rpc('submit_public_job_rpc'")
    expect(action).not.toContain('p_syndication_targets')
    expect(action).not.toContain('DEFAULT_TARGET_IDS')
    expect(action).not.toContain("sb.rpc('set_pending_job_syndication_targets'")
    expect(action).toContain(
      'safeApplyUrl(normalized.company_url, { requireHttps: true })',
    )
  })

  it('assigns reviewed feed targets atomically in the held submission boundary', () => {
    const migration = read(
      'supabase/migration-sources/held/20260830230000_freejobpost_submission_boundary.sql',
    )

    expect(migration).not.toContain('p_syndication_targets')
    expect(migration).toContain('reviewed_syndication_targets constant text[]')
    expect(migration).toContain('SET syndication_targets = reviewed_syndication_targets')
    expect(migration).not.toContain("'linkedin'")
    expect(migration).toContain("AND source = 'public_employer_post'")
    expect(migration).toContain("AND status = 'pending_review'")
    expect(migration).toContain('GET DIAGNOSTICS updated_jobs = ROW_COUNT')
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.set_pending_job_syndication_targets(uuid, text[])',
    )
    expect(migration).toContain('length(normalized_apply_url) > 500')
    expect(migration).toContain(
      "apply_authority ~* '^(0x[0-9a-f]+|[0-9]+)(\\.(0x[0-9a-f]+|[0-9]+))*(:[0-9]{1,5})?$'",
    )
    expect(migration).not.toContain('ADD CONSTRAINT public_employer_apply_url_requires_https')
    expect(migration).toContain('A table-level HTTPS constraint is deliberately deferred')
  })

  it('keeps stored external URLs behind the shared HTTPS render guard', () => {
    const jobPage = read('src/app/jobs/[slug]/page.tsx')
    const employerPage = read('src/app/employers/[slug]/page.tsx')
    const clickRoute = read('src/app/click/[slug]/route.ts')

    expect(jobPage).toContain(
      'const externalApplyUrl = safeApplyUrl(job.apply_url, { requireHttps: true })',
    )
    expect(jobPage).toContain('{externalApplyUrl ? (')
    expect(employerPage).toContain(
      'const companyUrl = safeApplyUrl(employer.company_url, { requireHttps: true })',
    )
    expect(employerPage).toContain('href={companyUrl}')
    expect(clickRoute).toContain("normalizePartner(req.nextUrl.searchParams.get('p'))")
    expect(clickRoute).toContain('{0,120}')
  })

  it('source-gates the public apply RPC and reasserts its exact privileges', () => {
    const migration = read(
      'supabase/migrations/20260828_scope_employer_applications_to_direct_posts.sql',
    )
    const signature =
      'public.apply_to_job_rpc(uuid, text, text, text, text, text, text)'
    expect(migration).toContain("source = 'public_employer_post'")
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`)
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`)
    expect(migration).toContain(`COMMENT ON FUNCTION ${signature}`)
    expect(migration).toContain('TO anon;')
  })
})
