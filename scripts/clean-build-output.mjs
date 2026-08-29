import { rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2]

const relativeTargets =
  mode === 'next'
    ? ['.next/cache/fetch-cache']
    : mode === 'cloudflare'
      ? ['.next/cache/fetch-cache', '.open-next']
      : mode === 'artifacts'
        ? ['.next', '.open-next']
      : null

if (!relativeTargets) {
  throw new Error('Usage: node scripts/clean-build-output.mjs <next|cloudflare|artifacts>')
}

for (const relativeTarget of relativeTargets) {
  const target = resolve(repoRoot, relativeTarget)
  if (!target.startsWith(`${repoRoot}${sep}`)) {
    throw new Error(`Refusing to clean a path outside the repository: ${target}`)
  }
  await rm(target, { recursive: true, force: true })
  console.log(`[build-clean] cleared ${relativeTarget}`)
}
