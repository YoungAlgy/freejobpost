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
