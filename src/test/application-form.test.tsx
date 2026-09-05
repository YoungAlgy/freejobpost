import { readFileSync } from 'node:fs'
import { createElement, type AnchorHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApplyForm from '../app/jobs/[slug]/apply/apply-form'
import { sanitizeResumeUrl } from '../lib/sanitize-resume-url'

vi.mock('next/link', () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props) }))
vi.mock('../app/jobs/[slug]/apply/actions', () => ({ submitApplication: vi.fn() }))
vi.mock('@/components/TurnstileWidget', () => ({ default: () => null }))

const source = readFileSync(new URL('../app/jobs/[slug]/apply/apply-form.tsx', import.meta.url), 'utf8')
// Inspect surrounding copy without importing the server page or its services.
const pageSource = readFileSync(new URL('../app/jobs/[slug]/apply/page.tsx', import.meta.url), 'utf8')
const render = () => renderToStaticMarkup(createElement(ApplyForm, { jobId: 'local-job', jobSlug: 'local-nurse-job', jobTitle: 'Local review nurse role' }))

describe('public application form', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('explains configured verification before the candidate submits', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'local-test-key')
    const html = render()
    expect(html).toContain('Complete the verification before sending your application.')
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*disabled=""/)
  })

  it('does not demand a challenge in the established no-config local mode', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    const html = render()
    expect(html).not.toContain('Complete the verification')
    expect(html).toContain('Send application')
  })

  it('keeps required names/email and optional inputs on the existing contract', () => {
    const html = render()
    expect(html.match(/required=""/g)).toHaveLength(3)
    expect(html).toContain('autoComplete="given-name"')
    expect(html).toContain('autoComplete="family-name"')
    expect(html).toContain('type="email"')
    expect(html).toContain('maxLength="2000"')
    expect(html).not.toContain('type="checkbox"')
  })

  it('keeps manual resume sharing explicit and does not introduce a recruiter brand', () => {
    const html = render()
    expect(html).toContain('Your FreeResumePost profile is not attached automatically.')
    expect(html).toContain('Sending this application shares the details you enter with the employer for this job.')
    expect(html).not.toMatch(/Ava Health|Beacon|membership|sign up/i)
  })

  it('retains fields on verification retry and guards duplicate in-flight submission', () => {
    const retry = source.slice(source.indexOf('function retryVerification'), source.indexOf('function canSubmit'))
    expect(retry).toContain('setTurnstileKey')
    expect(retry).not.toContain('setValues')
    expect(source).toContain('if (submissionRef.current || pending || !canSubmit() || !verificationReady) return')
    expect(source).toContain('submissionRef.current = true')
    expect(source).toContain('submissionRef.current = false')
    expect(source).toContain('<fieldset disabled={pending}')
    expect(source).toContain('const submitted = { ...values, job_id: jobId }')
    expect(source).toContain('submitApplication(null, submitted, turnstileToken')
  })

  it('keeps unknown results distinct from confirmed acceptance and mail delivery', () => {
    expect(source).toContain("if (result?.state === 'submitted')")
    expect(source).toContain('!result.notificationReported')
    expect(source).toContain('Your application is saved, so you do not need to send it again.')
    expect(source).not.toContain('We sent it to the employer.')
    expect(source).not.toContain('Most healthcare employers respond within a few days.')
    expect(source).toContain("result?.state === 'unknown' ? 'Try sending again'")
    expect(source).toContain('if (!mountedRef.current) return')
  })

  it('supports a narrow footer and long submitted contact values', () => {
    expect(source).toContain('flex flex-col-reverse sm:flex-row')
    expect(source).toContain('<strong className="break-all">{submittedContact.email}</strong>')
    expect(source).toContain('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1')
    expect(render()).toContain('min-h-11')
  })

  it('rejects optional resume links that the server would silently discard', () => {
    expect(sanitizeResumeUrl('ftp://example.invalid/resume.pdf')).toBeNull()
    expect(sanitizeResumeUrl('https://user:pass@example.invalid/resume.pdf')).toBeNull()
    expect(sanitizeResumeUrl('https://example.invalid/resume.pdf')).toBe('https://example.invalid/resume.pdf')
    expect(source).toContain('!values.resume_url.trim() || sanitizeResumeUrl(values.resume_url) !== null')
    expect(source).toContain('values.last_name.trim().length > 0 && resumeLinkValid')
    expect(source).toContain('aria-invalid={!resumeLinkValid}')
    expect(source).toContain('resume-link-help resume-link-error')
  })

  it('keeps surrounding page copy accurate for optional phone and timing', () => {
    expect(pageSource).toContain('No account required.')
    expect(pageSource).not.toContain('Takes under 60 seconds.')
    expect(pageSource).toContain('They may contact you by email or phone if you provide a number.')
    expect(pageSource).toContain("robots: { index: false, follow: true }")
  })
})
