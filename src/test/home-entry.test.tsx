import { createElement, type AnchorHTMLAttributes } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Home, { metadata } from '../app/page'
import { SiteHeader } from '../components/SiteHeader'

vi.mock('next/link', () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props),
}))

describe('standalone FreeJobPost entry page', () => {
  it('keeps the product name and posting entry visible with a larger mobile menu target', () => {
    const html = renderToStaticMarkup(createElement(SiteHeader))
    expect(html).toContain('FreeJobPost home')
    expect(html).toMatch(/<span[^>]*>FreeJobPost<\/span>/)
    expect(html).toMatch(/href="\/post-job"[^>]*>Post a job<\/a>/)
    const menu = html.match(/<button\b[^>]*>/)?.[0] ?? ''
    expect(menu).toContain('aria-expanded="false"')
    expect(menu).toContain('min-h-11 min-w-11')
  })

  it('renders one healthcare job-seeker heading without inventory or recruiter-brand claims', () => {
    const html = renderToStaticMarkup(createElement(Home))
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('Find your next healthcare job.')
    expect(html).toContain('nursing and allied health roles posted directly by employers')
    expect(html).not.toMatch(/Ava Health|Beacon|\d[,.\d]*\+? (open roles|jobs|candidates)/i)
  })

  it('uses a native GET search with the existing q contract and no required account or script', () => {
    const html = renderToStaticMarkup(createElement(Home))
    const form = html.match(/<form\b[^>]*>/)?.[0] ?? ''
    expect(form).toContain('action="/jobs"')
    expect(form).toContain('method="get"')
    expect(form).toContain('role="search"')
    expect(html).toContain('aria-label="Find healthcare jobs"')
    expect(html).toContain('for="home-job-search"')
    const input = html.match(/<input\b[^>]*>/)?.[0] ?? ''
    expect(input).toContain('id="home-job-search"')
    expect(input).toContain('name="q"')
    expect(input).toContain('type="search"')
    expect(input).toContain('maxLength="80"')
    expect(input).not.toContain('required')
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Find jobs<\/button>/)
    expect(html).toMatch(/href="\/jobs"[^>]*>Browse all jobs<\/a>/)
  })

  it('keeps a separate free employer posting and returning-employer path', () => {
    const html = renderToStaticMarkup(createElement(Home))
    expect(html).toContain('Hiring? Post your opening free.')
    expect(html).toMatch(/href="\/post-job"[^>]*>Post a job<\/a>/)
    expect(html).toMatch(/href="\/employer"[^>]*>Manage my jobs<\/a>/)
    expect(html).not.toMatch(/href="\/(pricing|signup|checkout)"/)
  })

  it('connects to the resume product without implying a shared application or public resume', () => {
    const html = renderToStaticMarkup(createElement(Home))
    expect(html).toMatch(/href="https:\/\/www\.freeresumepost\.co"[^>]*>Create my resume profile<\/a>/)
    expect(html).toContain('It stays private unless you turn on a limited public link.')
    expect(html).toContain('Your resume profile stays separate.')
    expect(html).toContain('Browsing jobs does not send your resume or apply for a job.')
  })

  it('keeps the product search identity on its own canonical domain', () => {
    expect(metadata.title).toEqual({ absolute: 'Find or Post Nursing and Allied Health Jobs | FreeJobPost' })
    expect(metadata.alternates?.canonical).toBe('https://freejobpost.co')
    expect(metadata.openGraph).toMatchObject({ siteName: 'FreeJobPost', url: 'https://freejobpost.co' })
  })
})
