import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
      expect(contents, path).not.toMatch(/freeresumepost\.co/i)
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
    expect(trackedClick).toContain('safeApplyUrl(job.apply_url)')
    expect(nativeApply).not.toContain('new URL(job.apply_url)')
    expect(trackedClick).not.toContain('function safeApplyUrl')
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
