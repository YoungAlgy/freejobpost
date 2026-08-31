import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { parse as parseModule } from 'es-module-lexer/js'
import stripJsonComments from 'strip-json-comments'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE_PROVENANCE_FILE = '.freejobpost-release.json'
const RELEASE_CANDIDATE_FILE = '.freejobpost-candidate.json'
const RELEASE_BUILD_POLICY = 'clean-commit-public-env-only-v2'
const EXPECTED_CLOUDFLARE_ACCOUNT_ID = 'faf641f1b778a8e0bd365c5141da649d'
const EXPECTED_CLOUDFLARE_WORKER_NAME = 'freejobpost'
const EXPECTED_SUPABASE_PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const EXPECTED_SUPABASE_URL = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`
const SUPABASE_PUBLIC_KEY_PROBE_URL = `${EXPECTED_SUPABASE_URL}/auth/v1/settings`
const SUPABASE_PUBLIC_KEY_PROBE_TIMEOUT_MS = 5_000
const WORKER_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REQUIRED_PUBLIC_BUILD_BINDINGS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL',
]
const OPTIONAL_PUBLIC_BUILD_BINDINGS = ['NEXT_PUBLIC_TURNSTILE_SITE_KEY']
const REQUIRED_CLOUDFLARE_BINDINGS = [
  'ASSETS',
  'NEXT_INC_CACHE_R2_BUCKET',
  'NEXT_TAG_CACHE_D1',
  'NEXT_CACHE_DO_QUEUE',
  'WORKER_SELF_REFERENCE',
]
const PROTECTED_UNTRACKED_RELEASE_EXCLUSION = '_migrate_data.mjs'
const LOCKED_RELEASE_PACKAGES = {
  next: 'node_modules/next',
  '@opennextjs/cloudflare': 'node_modules/@opennextjs/cloudflare',
  wrangler: 'node_modules/wrangler',
  'es-module-lexer': 'node_modules/es-module-lexer',
  'strip-json-comments': 'node_modules/strip-json-comments',
}
const SYSTEM_ENV_ALLOWLIST = [
  'COMSPEC',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'Path',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'WINDIR',
]
const CLOUDFLARE_AUTH_ENV_ALLOWLIST = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_EMAIL',
]

function assertInside(parent, child, label) {
  const parentPrefix = `${resolve(parent)}${sep}`
  const resolvedChild = resolve(child)
  if (!resolvedChild.startsWith(parentPrefix)) {
    throw new Error(`Refusing ${label} outside its expected parent: ${resolvedChild}`)
  }
}

function cleanValue(name, environment) {
  const value = environment[name]
  if (typeof value !== 'string' || !value) {
    throw new Error(`${name} is required for a sanitized release build.`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must not contain surrounding whitespace.`)
  }
  if (value.includes('<') || value.includes('>')) {
    throw new Error(`${name} contains a placeholder instead of a release value.`)
  }
  return value
}

export function validateSupabasePublicKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return
  if (value.startsWith('sb_secret_')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY received a secret key. Use the public publishable key.',
    )
  }
  const segments = value.split('.')
  if (segments.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'))
      if (
        payload?.role === 'anon' &&
        payload?.ref === EXPECTED_SUPABASE_PROJECT_REF
      ) {
        return
      }
    } catch {
      // The generic public-key error below keeps the value out of logs.
    }
  }
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY must be a Supabase publishable key or a legacy anon-role JWT for the configured project.',
  )
}

/** @param {Record<string, string | undefined>} [environment] */
export function validatedPublicBuildEnvironment(environment = process.env) {
  const publicEnvironment = Object.fromEntries(
    REQUIRED_PUBLIC_BUILD_BINDINGS.map((name) => [name, cleanValue(name, environment)]),
  )

  if (
    environment.NEXT_PUBLIC_SUPABASE_URL !== EXPECTED_SUPABASE_URL ||
    publicEnvironment.NEXT_PUBLIC_SUPABASE_URL !== EXPECTED_SUPABASE_URL
  ) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must be exactly ${EXPECTED_SUPABASE_URL}.`,
    )
  }
  if (
    publicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY.length < 20 ||
    /\s/.test(publicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not a valid public build value.')
  }
  validateSupabasePublicKey(publicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (
    !/^[^@\s]+@freejobpost\.co$/i.test(
      publicEnvironment.NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL,
    )
  ) {
    throw new Error(
      'NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL must be a FreeJobPost-owned address.',
    )
  }

  for (const name of OPTIONAL_PUBLIC_BUILD_BINDINGS) {
    const rawValue = environment[name]
    if (!rawValue) continue
    if (rawValue !== rawValue.trim()) {
      throw new Error(`${name} must not contain surrounding whitespace.`)
    }
    const value = rawValue
    if (value.includes('<') || value.includes('>')) {
      throw new Error(`${name} contains a placeholder instead of a release value.`)
    }
    publicEnvironment[name] = value
  }

  return publicEnvironment
}

/**
 * @param {string} value
 * @param {{
 *   fetchImpl?: typeof globalThis.fetch,
 *   timeoutMs?: number,
 * }} [options]
 */
export async function verifySupabasePublicKeyProject(value, options = {}) {
  validateSupabasePublicKey(value)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? SUPABASE_PUBLIC_KEY_PROBE_TIMEOUT_MS
  if (typeof fetchImpl !== 'function') {
    throw new Error('The Supabase public-key ownership check is unavailable.')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new Error('The Supabase public-key ownership timeout is invalid.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(SUPABASE_PUBLIC_KEY_PROBE_URL, {
      method: 'GET',
      headers: { apikey: value },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(
        'The supplied public key did not authorize against the pinned Supabase project.',
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'The supplied public key did not authorize against the pinned Supabase project.'
    ) {
      throw error
    }
    if (controller.signal.aborted) {
      throw new Error('The Supabase public-key ownership check timed out.')
    }
    throw new Error('The Supabase public-key ownership check failed.')
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizedChildEnvironment(publicEnvironment = {}) {
  const childEnvironment = {}
  for (const name of SYSTEM_ENV_ALLOWLIST) {
    if (process.env[name] !== undefined) childEnvironment[name] = process.env[name]
  }

  return {
    ...childEnvironment,
    ...publicEnvironment,
    CI: '1',
    FREEJOBPOST_RELEASE_BUILD: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
    NO_UPDATE_NOTIFIER: '1',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  }
}

function isolatePackageManagerConfig(childEnvironment, workspace) {
  return {
    ...childEnvironment,
    NPM_CONFIG_USERCONFIG: resolve(workspace, '.npmrc'),
  }
}

function cloudflareCommandEnvironment(childEnvironment) {
  const environment = { ...childEnvironment }
  const configuredAccount = process.env.CLOUDFLARE_ACCOUNT_ID
  if (configuredAccount && configuredAccount !== EXPECTED_CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID does not match the FreeJobPost account.')
  }
  for (const name of CLOUDFLARE_AUTH_ENV_ALLOWLIST) {
    if (process.env[name] !== undefined) environment[name] = process.env[name]
  }
  environment.CLOUDFLARE_ACCOUNT_ID = EXPECTED_CLOUDFLARE_ACCOUNT_ID
  return environment
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
    }

    child.once('error', rejectRun)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun({ stdout, stderr })
        return
      }
      rejectRun(
        new Error(
          `${options.label ?? command} failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.${
            options.capture && options.includeCapturedFailureOutput !== false
              ? `\n${stdout}${stderr}`
              : ''
          }`,
        ),
      )
    })
  })
}

export function validateTrackedReleaseSource(trackedStatus) {
  if (trackedStatus.length > 0) {
    throw new Error(
      'Release source has staged or unstaged tracked changes. Commit the reviewed source first.',
    )
  }
}

export function validateUntrackedReleaseSource({
  trackedProtectedPath,
  protectedUntrackedPath,
  otherUntrackedStatus,
}) {
  if (trackedProtectedPath.length > 0) {
    throw new Error(
      'The protected release exclusion must remain outside tracked source.',
    )
  }

  const protectedUntrackedExclusions = protectedUntrackedPath
    .split('\0')
    .filter(Boolean)
  if (
    protectedUntrackedExclusions.some(
      (path) => path !== PROTECTED_UNTRACKED_RELEASE_EXCLUSION,
    )
  ) {
    throw new Error('Git returned an unexpected protected release exclusion.')
  }
  if (otherUntrackedStatus.length > 0) {
    throw new Error(
      'Release source has an untracked file outside the one protected exclusion. Commit or remove it first.',
    )
  }

  return { protectedUntrackedExclusions }
}

async function assertReleaseSourceClean() {
  const environment = sanitizedChildEnvironment()
  const trackedStatus = await run(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
    {
      cwd: repoRoot,
      env: environment,
      capture: true,
      label: 'Git tracked-source status',
    },
  )
  validateTrackedReleaseSource(trackedStatus.stdout)
  try {
    await run(
      'git',
      ['diff', '--cached', '--quiet', '--exit-code', 'HEAD', '--'],
      {
        cwd: repoRoot,
        env: environment,
        capture: true,
        label: 'Git index versus HEAD check',
      },
    )
  } catch {
    throw new Error(
      'Release source index does not match HEAD. Commit the reviewed source first.',
    )
  }

  const trackedProtectedPath = await run(
    'git',
    ['ls-files', '-z', '--', `:(top,literal)${PROTECTED_UNTRACKED_RELEASE_EXCLUSION}`],
    {
      cwd: repoRoot,
      env: environment,
      capture: true,
      label: 'Protected release-exclusion tracked status',
    },
  )
  const protectedUntrackedPath = await run(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      `:(top,literal)${PROTECTED_UNTRACKED_RELEASE_EXCLUSION}`,
    ],
    {
      cwd: repoRoot,
      env: environment,
      capture: true,
      label: 'Protected release-exclusion untracked status',
    },
  )

  const otherUntrackedStatus = await run(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '.',
      `:(top,exclude,literal)${PROTECTED_UNTRACKED_RELEASE_EXCLUSION}`,
    ],
    {
      cwd: repoRoot,
      env: environment,
      capture: true,
      label: 'Git untracked-source status',
    },
  )
  return validateUntrackedReleaseSource({
    trackedProtectedPath: trackedProtectedPath.stdout,
    protectedUntrackedPath: protectedUntrackedPath.stdout,
    otherUntrackedStatus: otherUntrackedStatus.stdout,
  })
}

export function validateInstalledVersionsAgainstLockfile(
  lockfile,
  installedVersions,
) {
  if (!lockfile || typeof lockfile !== 'object' || !lockfile.packages) {
    throw new Error('package-lock.json has no packages inventory.')
  }
  const lockedVersions = {}
  for (const [packageName, lockfilePath] of Object.entries(LOCKED_RELEASE_PACKAGES)) {
    const lockedVersion = lockfile.packages[lockfilePath]?.version
    const installedVersion = installedVersions[packageName]
    if (!lockedVersion || typeof lockedVersion !== 'string') {
      throw new Error(`package-lock.json has no exact version for ${packageName}.`)
    }
    if (!installedVersion || installedVersion !== lockedVersion) {
      throw new Error(
        `${packageName} installed version does not match package-lock.json.`,
      )
    }
    lockedVersions[packageName] = lockedVersion
  }
  return lockedVersions
}

async function gitRevision(expression) {
  const result = await run('git', ['rev-parse', '--verify', expression], {
    cwd: repoRoot,
    env: sanitizedChildEnvironment(),
    capture: true,
    label: `Git revision ${expression}`,
  })
  const revision = result.stdout.trim()
  if (!/^[0-9a-f]{40,64}$/i.test(revision)) {
    throw new Error(`Git returned an invalid revision for ${expression}.`)
  }
  return revision.toLowerCase()
}

async function collectReleaseInputs(sourceCleanliness) {
  const packageLockResult = await run(
    'git',
    ['show', 'HEAD:package-lock.json'],
    {
      cwd: repoRoot,
      env: sanitizedChildEnvironment(),
      capture: true,
      label: 'committed package-lock.json read',
    },
  )
  const packageLockContents = packageLockResult.stdout
  const lockfile = JSON.parse(packageLockContents)
  const installedVersions = await installedReleasePackageVersions()
  const versions = validateInstalledVersionsAgainstLockfile(lockfile, installedVersions)

  return {
    sourceHead: await gitRevision('HEAD'),
    sourceTree: await gitRevision('HEAD^{tree}'),
    packageLockSha256: createHash('sha256')
      .update(packageLockContents, 'utf8')
      .digest('hex'),
    versions,
    protectedUntrackedExclusions: [
      ...sourceCleanliness.protectedUntrackedExclusions,
    ],
  }
}

async function installedReleasePackageVersions() {
  const installedVersions = {}
  for (const [packageName, lockfilePath] of Object.entries(LOCKED_RELEASE_PACKAGES)) {
    const packageJsonPath = resolve(repoRoot, lockfilePath, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    installedVersions[packageName] = packageJson.version
  }
  return installedVersions
}

async function assertReleaseInputsUnchanged(expected, phase) {
  const current = await collectReleaseInputs(await assertReleaseSourceClean())
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error(`Release inputs changed ${phase}.`)
  }
  return current
}

async function assertWorkspaceLockMatches(workspace, releaseInputs) {
  const packageLockContents = await readFile(resolve(workspace, 'package-lock.json'), 'utf8')
  const packageLockSha256 = createHash('sha256')
    .update(packageLockContents, 'utf8')
    .digest('hex')
  if (packageLockSha256 !== releaseInputs.packageLockSha256) {
    throw new Error('The isolated workspace package lock does not match release provenance.')
  }
  const versions = validateInstalledVersionsAgainstLockfile(
    JSON.parse(packageLockContents),
    await installedReleasePackageVersions(),
  )
  if (JSON.stringify(versions) !== JSON.stringify(releaseInputs.versions)) {
    throw new Error('Installed release tools changed after provenance was captured.')
  }
}

async function trackedFiles() {
  const result = await run('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    env: sanitizedChildEnvironment(),
    capture: true,
    label: 'git tracked-file inventory',
  })
  return result.stdout.split('\0').filter(Boolean)
}

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function copyTrackedWorkingTree(destination) {
  const files = await trackedFiles()
  const unsafeEnvironmentSources = files.filter((path) => {
    const normalized = path.replaceAll('\\', '/')
    return (
      /(^|\/)\.env(?:\.|$)/i.test(normalized) &&
      !normalized.endsWith('/.env.example') &&
      normalized !== '.env.example'
    )
  })
  if (unsafeEnvironmentSources.length > 0) {
    throw new Error(
      `Tracked environment files are forbidden in a sanitized build: ${unsafeEnvironmentSources.join(', ')}`,
    )
  }

  for (const trackedPath of files) {
    const normalizedPath = trackedPath.replaceAll('\\', '/')
    if (normalizedPath === PROTECTED_UNTRACKED_RELEASE_EXCLUSION) {
      throw new Error(
        'The protected release exclusion must remain outside tracked source.',
      )
    }
    if (isAbsolute(trackedPath) || trackedPath.split(/[\\/]/).includes('..')) {
      throw new Error(`Unsafe tracked path: ${trackedPath}`)
    }
  }

  const destinationPrefix = `${resolve(destination).replaceAll('\\', '/')}/`
  await run(
    'git',
    ['checkout-index', '--all', `--prefix=${destinationPrefix}`],
    {
      cwd: repoRoot,
      env: sanitizedChildEnvironment(),
      label: 'reviewed Git index checkout',
    },
  )
}

async function linkDependencies(destination) {
  const source = resolve(repoRoot, 'node_modules')
  const target = resolve(destination, 'node_modules')
  if (!(await pathExists(source))) {
    throw new Error('node_modules is required. Install dependencies before the release build.')
  }
  assertInside(destination, target, 'dependency link')
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

function workspacePackageCli(workspace, ...segments) {
  return resolve(workspace, 'node_modules', ...segments)
}

export function validateWorkerSource(worker) {
  const privateKeyMarker = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')
  if (worker.includes(privateKeyMarker)) {
    throw new Error('OpenNext worker contains a private-key literal.')
  }
  let moduleExports
  try {
    ;[, moduleExports] = parseModule(worker)
  } catch {
    throw new Error('OpenNext worker is not valid ECMAScript module source.')
  }
  if (!moduleExports.some((moduleExport) => moduleExport.n === 'DOQueueHandler')) {
    throw new Error('OpenNext worker does not export DOQueueHandler.')
  }
}

async function validateWorkerExport(workerPath) {
  const worker = await readFile(workerPath, 'utf8')
  validateWorkerSource(worker)
  console.log('[release-check] DOQueueHandler export present')
}

async function artifactFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    assertInside(root, path, 'artifact fingerprint read')
    if (entry.isDirectory()) {
      files.push(...(await artifactFiles(path, root)))
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`OpenNext artifact contains an unsupported entry: ${path}`)
    }
    if (entry.name === RELEASE_PROVENANCE_FILE && directory === root) continue
    files.push(path)
  }
  return files
}

async function artifactFingerprint(artifactRoot) {
  const hash = createHash('sha256')
  const privateKeyMarker = Buffer.from(['-----BEGIN', 'PRIVATE KEY-----'].join(' '))
  const rsaPrivateKeyMarker = Buffer.from(['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '))
  const opensshPrivateKeyMarker = Buffer.from(['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' '))
  const files = await artifactFiles(artifactRoot)
  files.sort((a, b) => a.localeCompare(b, 'en'))
  for (const path of files) {
    const relativePath = path.slice(`${artifactRoot}${sep}`.length).replaceAll('\\', '/')
    const contents = await readFile(path)
    if (
      contents.includes(privateKeyMarker) ||
      contents.includes(rsaPrivateKeyMarker) ||
      contents.includes(opensshPrivateKeyMarker)
    ) {
      throw new Error(`OpenNext artifact contains a private-key literal in ${relativePath}.`)
    }
    hash.update(relativePath)
    hash.update('\0')
    hash.update(contents)
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function writeReleaseProvenance(artifactRoot, releaseInputs) {
  const provenance = {
    schemaVersion: 2,
    buildPolicy: RELEASE_BUILD_POLICY,
    publicBuildBindings: [...REQUIRED_PUBLIC_BUILD_BINDINGS],
    optionalPublicBuildBindings: [...OPTIONAL_PUBLIC_BUILD_BINDINGS],
    ...releaseInputs,
    artifactSha256: await artifactFingerprint(artifactRoot),
  }
  await writeFile(
    resolve(artifactRoot, RELEASE_PROVENANCE_FILE),
    `${JSON.stringify(provenance, null, 2)}\n`,
    'utf8',
  )
  console.log('[release-build] wrote sanitized artifact provenance')
}

async function validateReleaseProvenance(artifactRoot, expectedReleaseInputs) {
  const provenancePath = resolve(artifactRoot, RELEASE_PROVENANCE_FILE)
  let provenance
  try {
    provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
  } catch {
    throw new Error(
      'OpenNext artifact has no valid sanitized-build provenance. Run npm run cf:build.',
    )
  }
  if (
    provenance?.schemaVersion !== 2 ||
    provenance?.buildPolicy !== RELEASE_BUILD_POLICY ||
    JSON.stringify(provenance?.publicBuildBindings) !==
      JSON.stringify(REQUIRED_PUBLIC_BUILD_BINDINGS) ||
    JSON.stringify(provenance?.optionalPublicBuildBindings) !==
      JSON.stringify(OPTIONAL_PUBLIC_BUILD_BINDINGS) ||
    provenance?.sourceHead !== expectedReleaseInputs.sourceHead ||
    provenance?.sourceTree !== expectedReleaseInputs.sourceTree ||
    provenance?.packageLockSha256 !== expectedReleaseInputs.packageLockSha256 ||
    JSON.stringify(provenance?.versions) !==
      JSON.stringify(expectedReleaseInputs.versions) ||
    JSON.stringify(provenance?.protectedUntrackedExclusions) !==
      JSON.stringify(expectedReleaseInputs.protectedUntrackedExclusions)
  ) {
    throw new Error('OpenNext artifact has an unsupported release provenance policy.')
  }
  const actualFingerprint = await artifactFingerprint(artifactRoot)
  if (provenance.artifactSha256 !== actualFingerprint) {
    throw new Error('OpenNext artifact changed after its sanitized release build.')
  }
  console.log('[release-check] sanitized artifact provenance matches')
  return provenance
}

export function validateWranglerConfigSource(source) {
  let config
  try {
    config = JSON.parse(stripJsonComments(source))
  } catch {
    throw new Error('wrangler.jsonc is not valid JSONC.')
  }

  const exactKeys = (value, expected) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  const expectedTopLevelKeys = [
    '$schema',
    'name',
    'main',
    'compatibility_date',
    'compatibility_flags',
    'cache',
    'vars',
    'assets',
    'r2_buckets',
    'd1_databases',
    'durable_objects',
    'migrations',
    'services',
  ]
  if (!exactKeys(config, expectedTopLevelKeys)) {
    throw new Error('wrangler.jsonc has unexpected or missing top-level release keys.')
  }
  if (config.$schema !== 'node_modules/wrangler/config-schema.json') {
    throw new Error('wrangler.jsonc has the wrong schema identity.')
  }
  if (config?.name !== 'freejobpost') {
    throw new Error('wrangler.jsonc must target the freejobpost Worker.')
  }
  if (config?.main !== '.open-next/worker.js') {
    throw new Error('wrangler.jsonc must target the checked OpenNext worker.')
  }
  if (
    config.compatibility_date !== '2026-07-16' ||
    JSON.stringify(config.compatibility_flags) !== JSON.stringify(['nodejs_compat'])
  ) {
    throw new Error('wrangler.jsonc has the wrong compatibility policy.')
  }
  if (!exactKeys(config.cache, ['enabled']) || config.cache.enabled !== true) {
    throw new Error('wrangler.jsonc has the wrong cache policy.')
  }
  if (
    !exactKeys(config.vars, [
      'NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS',
      'NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE',
    ]) ||
    config.vars.NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS !== '3000' ||
    config.vars.NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE !== 'true'
  ) {
    throw new Error('wrangler.jsonc has unexpected or wrong plaintext variables.')
  }
  if (
    !exactKeys(config.assets, ['binding', 'directory']) ||
    config?.assets?.binding !== 'ASSETS' ||
    config?.assets?.directory !== '.open-next/assets'
  ) {
    throw new Error('wrangler.jsonc has the wrong ASSETS identity.')
  }

  const r2 = Array.isArray(config.r2_buckets) ? config.r2_buckets[0] : null
  if (
    config.r2_buckets?.length !== 1 ||
    !exactKeys(r2, ['binding', 'bucket_name']) ||
    r2.binding !== 'NEXT_INC_CACHE_R2_BUCKET' ||
    r2.bucket_name !== 'next-inc-cache'
  ) {
    throw new Error('wrangler.jsonc has the wrong R2 bucket identity.')
  }

  const d1 = Array.isArray(config.d1_databases) ? config.d1_databases[0] : null
  if (
    config.d1_databases?.length !== 1 ||
    !exactKeys(d1, ['binding', 'database_id', 'database_name']) ||
    d1.binding !== 'NEXT_TAG_CACHE_D1' ||
    d1.database_name !== 'next-tag-cache' ||
    d1.database_id !== '5ba0c998-b7bf-4e84-a056-eab1c787eb39'
  ) {
    throw new Error('wrangler.jsonc has the wrong D1 database identity.')
  }

  const durableObjectBindings = Array.isArray(config.durable_objects?.bindings)
    ? config.durable_objects.bindings
    : []
  const durableObject = durableObjectBindings[0]
  if (
    !exactKeys(config.durable_objects, ['bindings']) ||
    durableObjectBindings.length !== 1 ||
    !exactKeys(durableObject, ['class_name', 'name']) ||
    durableObject.name !== 'NEXT_CACHE_DO_QUEUE' ||
    durableObject.class_name !== 'DOQueueHandler' ||
    durableObject.script_name !== undefined
  ) {
    throw new Error('wrangler.jsonc has the wrong Durable Object identity.')
  }
  const migration = Array.isArray(config.migrations) ? config.migrations[0] : null
  if (
    config.migrations?.length !== 1 ||
    !exactKeys(migration, ['new_sqlite_classes', 'tag']) ||
    migration.tag !== 'v1' ||
    JSON.stringify(migration.new_sqlite_classes) !== JSON.stringify(['DOQueueHandler'])
  ) {
    throw new Error('wrangler.jsonc has no DOQueueHandler SQLite migration.')
  }

  const service = Array.isArray(config.services) ? config.services[0] : null
  if (
    config.services?.length !== 1 ||
    !exactKeys(service, ['binding', 'service']) ||
    service.binding !== 'WORKER_SELF_REFERENCE' ||
    service.service !== 'freejobpost'
  ) {
    throw new Error('wrangler.jsonc has the wrong Worker service identity.')
  }

  const allBindingNames = [
    config.assets.binding,
    ...config.r2_buckets.map((binding) => binding?.binding),
    ...config.d1_databases.map((binding) => binding?.binding),
    ...config.durable_objects.bindings.map((binding) => binding?.name),
    ...config.services.map((binding) => binding?.binding),
  ]
  for (const binding of REQUIRED_CLOUDFLARE_BINDINGS) {
    if (allBindingNames.filter((name) => name === binding).length !== 1) {
      throw new Error(`wrangler.jsonc must resolve ${binding} exactly once.`)
    }
  }

  return REQUIRED_CLOUDFLARE_BINDINGS.length
}

async function runWranglerDryRun(workspace, childEnvironment, bindingCount) {
  const dryRunOutput = resolve(workspace, '.wrangler-dry-run')
  assertInside(workspace, dryRunOutput, 'Wrangler dry-run output')
  await run(
    process.execPath,
    [
      workspacePackageCli(workspace, 'wrangler', 'bin', 'wrangler.js'),
      'deploy',
      '--dry-run',
      '--keep-vars',
      '--config',
      'wrangler.jsonc',
      '--outdir',
      dryRunOutput,
    ],
    {
      cwd: workspace,
      env: childEnvironment,
      capture: true,
      label: 'Wrangler dry run',
    },
  )
  console.log(
    `[release-check] Wrangler dry run resolved ${bindingCount} required bindings`,
  )
}

async function verifyWorkspace(
  workspace,
  childEnvironment,
  releaseInputs,
  requireProvenance = true,
) {
  const workerPath = resolve(workspace, '.open-next', 'worker.js')
  const artifactRoot = resolve(workspace, '.open-next')
  const configPath = resolve(workspace, 'wrangler.jsonc')
  if (!(await pathExists(workerPath))) {
    throw new Error('Missing .open-next/worker.js. Run npm run cf:build first.')
  }
  if (!(await pathExists(configPath))) {
    throw new Error('Missing wrangler.jsonc in the isolated release workspace.')
  }
  await assertWorkspaceLockMatches(workspace, releaseInputs)
  const bindingCount = validateWranglerConfigSource(
    await readFile(configPath, 'utf8'),
  )
  const artifactBeforeDryRun = await artifactFingerprint(artifactRoot)
  if (requireProvenance) {
    await validateReleaseProvenance(artifactRoot, releaseInputs)
  }
  await validateWorkerExport(workerPath)
  await runWranglerDryRun(workspace, childEnvironment, bindingCount)
  await assertWorkspaceLockMatches(workspace, releaseInputs)
  const artifactAfterDryRun = await artifactFingerprint(artifactRoot)
  if (artifactAfterDryRun !== artifactBeforeDryRun) {
    throw new Error('The OpenNext artifact changed during the Wrangler dry run.')
  }
  if (requireProvenance) {
    await validateReleaseProvenance(artifactRoot, releaseInputs)
  }
}

async function createIsolatedWorkspace(prefix) {
  const workspace = await mkdtemp(join(tmpdir(), prefix))
  assertInside(tmpdir(), workspace, 'isolated release workspace')
  try {
    await copyTrackedWorkingTree(workspace)
    await linkDependencies(workspace)
    await writeFile(resolve(workspace, '.npmrc'), '', 'utf8')
    return workspace
  } catch (error) {
    await rm(workspace, { recursive: true, force: true })
    throw error
  }
}

async function installArtifact(sourceArtifact) {
  const stagingRoot = resolve(repoRoot, '.temp')
  const stagedArtifact = resolve(stagingRoot, `freejobpost-open-next-${process.pid}`)
  const backupArtifact = resolve(
    stagingRoot,
    `freejobpost-open-next-backup-${process.pid}`,
  )
  const targetArtifact = resolve(repoRoot, '.open-next')
  assertInside(repoRoot, stagedArtifact, 'staged OpenNext artifact')
  assertInside(repoRoot, backupArtifact, 'OpenNext artifact backup')
  assertInside(repoRoot, targetArtifact, 'OpenNext artifact replacement')

  await mkdir(stagingRoot, { recursive: true })
  await rm(stagedArtifact, { recursive: true, force: true })
  await rm(backupArtifact, { recursive: true, force: true })
  await cp(sourceArtifact, stagedArtifact, { recursive: true })
  const hadPriorArtifact = await pathExists(targetArtifact)
  if (hadPriorArtifact) await rename(targetArtifact, backupArtifact)
  try {
    await rename(stagedArtifact, targetArtifact)
  } catch (error) {
    if (hadPriorArtifact && (await pathExists(backupArtifact))) {
      await rename(backupArtifact, targetArtifact)
    }
    throw error
  }
  await rm(backupArtifact, { recursive: true, force: true })
  console.log('[release-build] installed verified .open-next artifact')
}

async function build() {
  const sourceCleanliness = await assertReleaseSourceClean()
  const releaseInputs = await collectReleaseInputs(sourceCleanliness)
  const publicEnvironment = validatedPublicBuildEnvironment()
  await verifySupabasePublicKeyProject(
    publicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  await assertReleaseInputsUnchanged(
    releaseInputs,
    'during the public-key ownership check',
  )
  let childEnvironment = sanitizedChildEnvironment(publicEnvironment)
  let workspace
  try {
    workspace = await createIsolatedWorkspace('freejobpost-release-build-')
    childEnvironment = isolatePackageManagerConfig(childEnvironment, workspace)
    await assertReleaseInputsUnchanged(
      releaseInputs,
      'while the isolated source was checked out',
    )
    await assertWorkspaceLockMatches(workspace, releaseInputs)
    console.log(
      `[release-build] isolated tracked source with ${REQUIRED_PUBLIC_BUILD_BINDINGS.length} required public bindings`,
    )
    await run(
      process.execPath,
      [
        workspacePackageCli(
          workspace,
          '@opennextjs',
          'cloudflare',
          'dist',
          'cli',
          'index.js',
        ),
        'build',
      ],
      {
        cwd: workspace,
        env: childEnvironment,
        label: 'sanitized OpenNext build',
      },
    )
    await verifyWorkspace(workspace, childEnvironment, releaseInputs, false)
    await assertReleaseInputsUnchanged(releaseInputs, 'during the sanitized build')
    const artifactRoot = resolve(workspace, '.open-next')
    await writeReleaseProvenance(artifactRoot, releaseInputs)
    await validateReleaseProvenance(artifactRoot, releaseInputs)
    await assertWorkspaceLockMatches(workspace, releaseInputs)
    await assertReleaseInputsUnchanged(releaseInputs, 'before artifact installation')
    await installArtifact(artifactRoot)
    await validateReleaseProvenance(resolve(repoRoot, '.open-next'), releaseInputs)
    await assertReleaseInputsUnchanged(releaseInputs, 'during artifact installation')
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true })
  }
}

async function withVerifiedReleaseWorkspace(action = async () => {}) {
  const sourceCleanliness = await assertReleaseSourceClean()
  const releaseInputs = await collectReleaseInputs(sourceCleanliness)
  const sourceArtifact = resolve(repoRoot, '.open-next')
  if (!(await pathExists(sourceArtifact))) {
    throw new Error('Missing .open-next artifact. Run npm run cf:build first.')
  }
  let childEnvironment = sanitizedChildEnvironment()
  let workspace
  try {
    workspace = await createIsolatedWorkspace('freejobpost-release-check-')
    childEnvironment = isolatePackageManagerConfig(childEnvironment, workspace)
    await assertReleaseInputsUnchanged(
      releaseInputs,
      'while the verified release workspace was created',
    )
    const isolatedArtifact = resolve(workspace, '.open-next')
    await cp(sourceArtifact, isolatedArtifact, { recursive: true })
    await verifyWorkspace(workspace, childEnvironment, releaseInputs)
    await assertReleaseInputsUnchanged(
      releaseInputs,
      'before the verified artifact action',
    )
    await action({ workspace, childEnvironment, releaseInputs })
    await validateReleaseProvenance(isolatedArtifact, releaseInputs)
    await assertWorkspaceLockMatches(workspace, releaseInputs)
    await assertReleaseInputsUnchanged(
      releaseInputs,
      'during the verified artifact action',
    )
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true })
  }
}

async function check() {
  await withVerifiedReleaseWorkspace()
}

export function parseUploadedVersionId(output) {
  const matches = [
    ...String(output).matchAll(
      /Worker Version ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    ),
  ].map((match) => match[1].toLowerCase())
  const uniqueMatches = [...new Set(matches)]
  if (uniqueMatches.length !== 1) {
    throw new Error('OpenNext did not return one exact uploaded Worker version ID.')
  }
  return uniqueMatches[0]
}

function normalizeWorkerVersionId(value, label) {
  if (typeof value !== 'string' || !WORKER_VERSION_ID_PATTERN.test(value)) {
    throw new Error(`${label} is not a valid Worker version ID.`)
  }
  return value.toLowerCase()
}

export function normalizedDeploymentVersions(deployment) {
  if (!Array.isArray(deployment?.versions)) {
    throw new Error('Cloudflare deployment status has no versions inventory.')
  }
  const seen = new Set()
  const versions = deployment.versions.map((version) => {
    const versionId = normalizeWorkerVersionId(
      version?.version_id,
      'Cloudflare deployment version',
    )
    const percentage = version?.percentage
    if (seen.has(versionId)) {
      throw new Error('Cloudflare deployment status contains a duplicate version ID.')
    }
    if (
      typeof percentage !== 'number' ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      throw new Error('Cloudflare deployment status has an invalid traffic percentage.')
    }
    seen.add(versionId)
    return { versionId, percentage }
  })
  const total = versions.reduce((sum, version) => sum + version.percentage, 0)
  if (versions.length === 0 || Math.abs(total - 100) > 0.000001) {
    throw new Error(
      'Cloudflare deployment status does not account for 100 percent traffic.',
    )
  }
  return versions.sort((left, right) => left.versionId.localeCompare(right.versionId))
}

export function validateSingleActiveDeployment(deployment) {
  const versions = normalizedDeploymentVersions(deployment)
  if (versions.length !== 1 || versions[0].percentage !== 100) {
    throw new Error('FreeJobPost must have one exact 100 percent production version.')
  }
  return versions[0].versionId
}

export function validateDeploymentUnchanged(
  before,
  after,
  context = 'the candidate upload',
) {
  const beforeVersions = normalizedDeploymentVersions(before)
  const afterVersions = normalizedDeploymentVersions(after)
  if (
    typeof before?.id !== 'string' ||
    before.id.length === 0 ||
    before.id !== after?.id ||
    JSON.stringify(beforeVersions) !== JSON.stringify(afterVersions)
  ) {
    throw new Error(`Production traffic changed during ${context}.`)
  }
  return afterVersions
}

export function validateTrafficState(
  deployment,
  { phase, currentVersionId, candidateVersionId },
) {
  const current = normalizeWorkerVersionId(
    currentVersionId,
    'Current production version',
  )
  const candidate = normalizeWorkerVersionId(
    candidateVersionId,
    'Candidate Worker version',
  )
  if (current === candidate) {
    throw new Error('Current and candidate Worker versions must be different.')
  }
  const versions = normalizedDeploymentVersions(deployment)
  let expected
  if (
    phase === 'stage-before' ||
    phase === 'rollback-before' ||
    phase === 'unstage-after'
  ) {
    expected = [{ versionId: current, percentage: 100 }]
  } else if (
    phase === 'stage-after' ||
    phase === 'promote-before' ||
    phase === 'unstage-before'
  ) {
    expected = [
      { versionId: current, percentage: 100 },
      { versionId: candidate, percentage: 0 },
    ].sort((left, right) => left.versionId.localeCompare(right.versionId))
  } else if (phase === 'promote-after' || phase === 'rollback-after') {
    expected = [{ versionId: candidate, percentage: 100 }]
  } else {
    throw new Error('Unknown FreeJobPost traffic validation phase.')
  }
  if (JSON.stringify(versions) !== JSON.stringify(expected)) {
    throw new Error(`Cloudflare traffic does not match the ${phase} contract.`)
  }
  return versions
}

export function classifyTrafficCommandOutcome(
  deployment,
  { beforePhase, afterPhase, currentVersionId, candidateVersionId },
) {
  try {
    validateTrafficState(deployment, {
      phase: afterPhase,
      currentVersionId,
      candidateVersionId,
    })
    return 'desired'
  } catch {
    try {
      validateTrafficState(deployment, {
        phase: beforePhase,
        currentVersionId,
        candidateVersionId,
      })
      return 'unchanged'
    } catch {
      return 'unknown'
    }
  }
}

const CANDIDATE_RECORD_KEYS = [
  'schemaVersion',
  'buildPolicy',
  'accountId',
  'workerName',
  'currentVersionId',
  'candidateVersionId',
  'sourceHead',
  'sourceTree',
  'packageLockSha256',
  'artifactSha256',
]

export function validateCandidateRecord(record, expected) {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify([...CANDIDATE_RECORD_KEYS].sort())
  ) {
    throw new Error('The FreeJobPost candidate record has an invalid shape.')
  }
  const exactValues = {
    schemaVersion: 1,
    buildPolicy: RELEASE_BUILD_POLICY,
    accountId: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
    workerName: EXPECTED_CLOUDFLARE_WORKER_NAME,
    currentVersionId: normalizeWorkerVersionId(
      expected.currentVersionId,
      'Expected current production version',
    ),
    candidateVersionId: normalizeWorkerVersionId(
      expected.candidateVersionId,
      'Expected candidate Worker version',
    ),
    sourceHead: expected.releaseInputs.sourceHead,
    sourceTree: expected.releaseInputs.sourceTree,
    packageLockSha256: expected.releaseInputs.packageLockSha256,
    artifactSha256: expected.provenance.artifactSha256,
  }
  for (const [name, value] of Object.entries(exactValues)) {
    if (record[name] !== value) {
      throw new Error(`The FreeJobPost candidate record has the wrong ${name}.`)
    }
  }
  if (record.currentVersionId === record.candidateVersionId) {
    throw new Error('The candidate record cannot point at the production version.')
  }
  return record
}

async function candidateRecordPath() {
  const path = resolve(repoRoot, RELEASE_CANDIDATE_FILE)
  assertInside(repoRoot, path, 'candidate record')
  if (await pathExists(path)) {
    const status = await lstat(path)
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error('The FreeJobPost candidate record path is unsafe.')
    }
  }
  return path
}

async function writeCandidateRecord(record, expected) {
  validateCandidateRecord(record, expected)
  await writeFile(
    await candidateRecordPath(),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  )
}

async function readCandidateRecord(expected) {
  let record
  try {
    record = JSON.parse(await readFile(await candidateRecordPath(), 'utf8'))
  } catch {
    throw new Error(
      'No valid FreeJobPost candidate record exists. Run npm run cf:upload first.',
    )
  }
  return validateCandidateRecord(record, expected)
}

function pinnedWorkerArguments(workspace, args) {
  return [
    ...args,
    '--name',
    EXPECTED_CLOUDFLARE_WORKER_NAME,
    '--config',
    resolve(workspace, 'wrangler.jsonc'),
  ]
}

async function runWranglerJson(workspace, environment, args, label) {
  const result = await run(
    process.execPath,
    [
      workspacePackageCli(workspace, 'wrangler', 'bin', 'wrangler.js'),
      ...pinnedWorkerArguments(workspace, [...args, '--json']),
    ],
    {
      cwd: workspace,
      env: environment,
      capture: true,
      includeCapturedFailureOutput: false,
      label,
    },
  )
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`${label} returned invalid JSON.`)
  }
}

async function runBindingCheck(
  workspace,
  environment,
  args,
  label,
) {
  const bindingCheck = resolve(
    workspace,
    'scripts',
    'check-cloudflare-bindings.mjs',
  )
  await run(process.execPath, [bindingCheck, ...args], {
    cwd: workspace,
    env: environment,
    label,
  })
}

async function runCheckedOpenNextCommand(command) {
  await withVerifiedReleaseWorkspace(
    async ({ workspace, childEnvironment, releaseInputs }) => {
      const artifactRoot = resolve(workspace, '.open-next')
      const cli = workspacePackageCli(
        workspace,
        '@opennextjs',
        'cloudflare',
        'dist',
        'cli',
        'index.js',
      )
      const cloudflareEnvironment = cloudflareCommandEnvironment(childEnvironment)
      const provenance = await validateReleaseProvenance(
        artifactRoot,
        releaseInputs,
      )
      await assertWorkspaceLockMatches(workspace, releaseInputs)
      await runBindingCheck(
        workspace,
        cloudflareEnvironment,
        [],
        'active FreeJobPost Cloudflare binding check',
      )
      await validateReleaseProvenance(artifactRoot, releaseInputs)
      await assertWorkspaceLockMatches(workspace, releaseInputs)

      if (command === 'preview') {
        await run(process.execPath, [cli, 'preview'], {
          cwd: workspace,
          env: cloudflareEnvironment,
          label: 'verified OpenNext preview',
        })
      } else {
        const deploymentBefore = await runWranglerJson(
          workspace,
          cloudflareEnvironment,
          ['deployments', 'status'],
          'pre-upload FreeJobPost deployment status',
        )
        const currentVersionId = validateSingleActiveDeployment(deploymentBefore)
        await validateReleaseProvenance(artifactRoot, releaseInputs)
        await assertWorkspaceLockMatches(workspace, releaseInputs)
        await assertReleaseInputsUnchanged(
          releaseInputs,
          'immediately before the verified candidate upload',
        )
        const upload = await run(
          process.execPath,
          [cli, 'upload', '--strict', '--keep-vars'],
          {
            cwd: workspace,
            env: cloudflareEnvironment,
            capture: true,
            includeCapturedFailureOutput: false,
            label: 'verified OpenNext zero-traffic upload',
          },
        )
        const versionId = parseUploadedVersionId(`${upload.stdout}\n${upload.stderr}`)
        if (versionId === currentVersionId) {
          throw new Error('The uploaded version matches the active production version.')
        }
        await runBindingCheck(
          workspace,
          cloudflareEnvironment,
          ['--version', versionId],
          'uploaded FreeJobPost candidate binding and traffic check',
        )
        const deploymentAfter = await runWranglerJson(
          workspace,
          cloudflareEnvironment,
          ['deployments', 'status'],
          'post-upload FreeJobPost deployment status',
        )
        validateDeploymentUnchanged(deploymentBefore, deploymentAfter)
        const record = {
          schemaVersion: 1,
          buildPolicy: RELEASE_BUILD_POLICY,
          accountId: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
          workerName: EXPECTED_CLOUDFLARE_WORKER_NAME,
          currentVersionId,
          candidateVersionId: versionId,
          sourceHead: releaseInputs.sourceHead,
          sourceTree: releaseInputs.sourceTree,
          packageLockSha256: releaseInputs.packageLockSha256,
          artifactSha256: provenance.artifactSha256,
        }
        await writeCandidateRecord(record, {
          currentVersionId,
          candidateVersionId: versionId,
          releaseInputs,
          provenance,
        })
        process.stdout.write(
          `${JSON.stringify({ currentVersionId, uploadedVersionId: versionId })}\n`,
        )
      }
      await validateReleaseProvenance(artifactRoot, releaseInputs)
    },
  )
}

async function runCheckedTrafficCommand(releaseCommand) {
  const { command, currentVersionId, candidateVersionId } = releaseCommand
  await withVerifiedReleaseWorkspace(
    async ({ workspace, childEnvironment, releaseInputs }) => {
      const artifactRoot = resolve(workspace, '.open-next')
      const cloudflareEnvironment = cloudflareCommandEnvironment(childEnvironment)
      const provenance = await validateReleaseProvenance(
        artifactRoot,
        releaseInputs,
      )
      const candidateRecordExpectation =
        command === 'rollback'
          ? {
              currentVersionId: candidateVersionId,
              candidateVersionId: currentVersionId,
            }
          : { currentVersionId, candidateVersionId }
      await readCandidateRecord({
        ...candidateRecordExpectation,
        releaseInputs,
        provenance,
      })

      const beforePhase =
        command === 'stage'
          ? 'stage-before'
          : command === 'promote'
            ? 'promote-before'
            : command === 'unstage'
              ? 'unstage-before'
              : 'rollback-before'
      const afterPhase =
        command === 'stage'
          ? 'stage-after'
          : command === 'promote'
            ? 'promote-after'
            : command === 'unstage'
              ? 'unstage-after'
              : 'rollback-after'
      let versionSpecs
      let message
      if (command === 'stage') {
        versionSpecs = [`${currentVersionId}@100`, `${candidateVersionId}@0`]
        message = 'Stage verified FreeJobPost candidate at zero traffic'
      } else if (command === 'promote') {
        versionSpecs = [`${candidateVersionId}@100`]
        message = 'Promote verified FreeJobPost candidate'
      } else if (command === 'unstage') {
        versionSpecs = [`${currentVersionId}@100`]
        message = 'Remove failed FreeJobPost zero-traffic candidate'
      } else {
        versionSpecs = [`${candidateVersionId}@100`]
        message = 'Rollback to recorded FreeJobPost production version'
      }

      await runBindingCheck(
        workspace,
        cloudflareEnvironment,
        [],
        'active FreeJobPost Cloudflare binding check before traffic change',
      )
      await runBindingCheck(
        workspace,
        cloudflareEnvironment,
        ['--version', candidateVersionId],
        'target FreeJobPost version binding and zero-traffic check',
      )
      const deploymentBefore = await runWranglerJson(
        workspace,
        cloudflareEnvironment,
        ['deployments', 'status'],
        'pre-change FreeJobPost deployment status',
      )
      validateTrafficState(deploymentBefore, {
        phase: beforePhase,
        currentVersionId,
        candidateVersionId,
      })
      await validateReleaseProvenance(artifactRoot, releaseInputs)
      await assertWorkspaceLockMatches(workspace, releaseInputs)
      await assertReleaseInputsUnchanged(
        releaseInputs,
        'immediately before the verified traffic change',
      )
      const deploymentImmediatelyBefore = await runWranglerJson(
        workspace,
        cloudflareEnvironment,
        ['deployments', 'status'],
        'final pre-change FreeJobPost deployment status',
      )
      validateDeploymentUnchanged(
        deploymentBefore,
        deploymentImmediatelyBefore,
        'the final traffic preflight',
      )
      validateTrafficState(deploymentImmediatelyBefore, {
        phase: beforePhase,
        currentVersionId,
        candidateVersionId,
      })

      let trafficCommandError = null
      try {
        await run(
          process.execPath,
          [
            workspacePackageCli(workspace, 'wrangler', 'bin', 'wrangler.js'),
            ...pinnedWorkerArguments(workspace, [
              'versions',
              'deploy',
              ...versionSpecs,
              '--yes',
              '--message',
              message,
            ]),
          ],
          {
            cwd: workspace,
            env: cloudflareEnvironment,
            label: `verified FreeJobPost ${command}`,
          },
        )
      } catch (error) {
        trafficCommandError = error
      }

      let deploymentAfter
      try {
        deploymentAfter = await runWranglerJson(
          workspace,
          cloudflareEnvironment,
          ['deployments', 'status'],
          'post-change FreeJobPost deployment status',
        )
      } catch {
        throw new Error(
          `The FreeJobPost ${command} command ${
            trafficCommandError ? 'failed' : 'returned success'
          }, but the live traffic state is UNKNOWN because the status check failed. Stop and verify it manually.`,
        )
      }
      const outcome = classifyTrafficCommandOutcome(deploymentAfter, {
        beforePhase,
        afterPhase,
        currentVersionId,
        candidateVersionId,
      })
      if (trafficCommandError) {
        if (outcome === 'desired') {
          throw new Error(
            `Wrangler reported that FreeJobPost ${command} failed, but read-only verification shows the requested traffic state was applied. Stop and verify it manually.`,
          )
        }
        if (outcome === 'unchanged') {
          throw new Error(
            `FreeJobPost ${command} failed and read-only verification shows traffic stayed unchanged.`,
          )
        }
        throw new Error(
          `FreeJobPost ${command} failed and live traffic is in an UNKNOWN state. Stop and verify it manually.`,
        )
      }
      if (outcome !== 'desired') {
        throw new Error(
          `FreeJobPost ${command} returned success but did not reach the exact requested traffic state. Live traffic is ${outcome.toUpperCase()}. Stop and verify it manually.`,
        )
      }
      await runBindingCheck(
        workspace,
        cloudflareEnvironment,
        [],
        'active FreeJobPost Cloudflare binding check after traffic change',
      )
      if (command === 'stage' || command === 'unstage') {
        await runBindingCheck(
          workspace,
          cloudflareEnvironment,
          ['--version', candidateVersionId],
          'staged FreeJobPost zero-traffic candidate check',
        )
      }
      await validateReleaseProvenance(artifactRoot, releaseInputs)
    },
  )
}

async function checkSourceIsolation() {
  let workspace
  try {
    workspace = await createIsolatedWorkspace('freejobpost-source-check-')
    for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
      if (await pathExists(resolve(workspace, name))) {
        throw new Error(`Isolated source unexpectedly contains ${name}.`)
      }
    }
    console.log('[release-check] isolated tracked source contains no active .env file')
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true })
  }
}

const RELEASE_USAGE =
  'Usage: node scripts/sanitized-cloudflare-release.mjs <build|check|source-check|preview|upload|stage --current UUID --candidate UUID|unstage --current UUID --candidate UUID|promote --current UUID --candidate UUID|rollback --current UUID --previous UUID>'

async function runReleaseCommand(releaseCommand) {
  const { command } = releaseCommand
  if (command === 'build') await build()
  else if (command === 'check') await check()
  else if (command === 'source-check') await checkSourceIsolation()
  else if (command === 'preview' || command === 'upload') {
    await runCheckedOpenNextCommand(command)
  } else if (['stage', 'unstage', 'promote', 'rollback'].includes(command)) {
    await runCheckedTrafficCommand(releaseCommand)
  } else {
    throw new Error(
      RELEASE_USAGE,
    )
  }
}

export function parseReleaseArguments(args) {
  if (!Array.isArray(args)) throw new Error('Release command arguments are invalid.')
  if (
    args.length === 1 &&
    ['build', 'check', 'source-check', 'preview', 'upload'].includes(args[0])
  ) {
    return { command: args[0] }
  }
  const command = args[0]
  const targetFlag = command === 'rollback' ? '--previous' : '--candidate'
  if (
    !['stage', 'unstage', 'promote', 'rollback'].includes(command) ||
    args.length !== 5 ||
    args[1] !== '--current' ||
    args[3] !== targetFlag
  ) {
    throw new Error(RELEASE_USAGE)
  }
  const currentVersionId = normalizeWorkerVersionId(
    args[2],
    'Current production version',
  )
  const candidateVersionId = normalizeWorkerVersionId(
    args[4],
    command === 'rollback' ? 'Previous production version' : 'Candidate Worker version',
  )
  if (currentVersionId === candidateVersionId) {
    throw new Error('Current and target Worker versions must be different.')
  }
  return { command, currentVersionId, candidateVersionId }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : ''
const modulePath = resolve(fileURLToPath(import.meta.url))
const isDirectExecution =
  process.platform === 'win32'
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath
if (isDirectExecution) {
  await runReleaseCommand(parseReleaseArguments(process.argv.slice(2)))
}
