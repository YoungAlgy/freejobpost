import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/app/post-job/post-job-form.tsx'),
  'utf8',
)

describe('employer success layout', () => {
  it('keeps returned contact, job path, and support email breakable', () => {
    expect(source.match(/<strong className="font-bold break-all">\{values\.contact_email\}<\/strong>/g))
      .toHaveLength(2)
    expect(source).toContain('<code className="break-all bg-white px-1.5 py-0.5 text-sm font-mono">')
    expect(source.match(/className="break-all underline hover:text-\[#17324D\]"/g)).toHaveLength(2)
  })
})
