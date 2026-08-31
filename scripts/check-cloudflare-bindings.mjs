import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const wranglerCli = resolve(
  repositoryRoot,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
)
const wranglerConfig = resolve(repositoryRoot, 'wrangler.jsonc')

export const EXPECTED_CLOUDFLARE_ACCOUNT_ID = 'faf641f1b778a8e0bd365c5141da649d'
export const EXPECTED_CLOUDFLARE_WORKER_NAME = 'freejobpost'
const WORKER_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const requiredBindings = new Map([
  ['ASSETS', { types: new Set(['assets']) }],
  [
    'NEXT_CACHE_DO_QUEUE',
    {
      types: new Set(['durable_object_namespace']),
      valid: (binding) =>
        binding.class_name === 'DOQueueHandler' &&
        !Object.hasOwn(binding, 'script_name') &&
        !Object.hasOwn(binding, 'environment'),
    },
  ],
  [
    'NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE',
    { types: new Set(['plain_text']), valid: (binding) => binding.text === 'true' },
  ],
  [
    'NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS',
    { types: new Set(['plain_text']), valid: (binding) => binding.text === '3000' },
  ],
  [
    'NEXT_INC_CACHE_R2_BUCKET',
    {
      types: new Set(['r2_bucket']),
      valid: (binding) => binding.bucket_name === 'next-inc-cache',
    },
  ],
  [
    'NEXT_PUBLIC_APP_URL',
    { types: new Set(['secret_text']) },
  ],
  [
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    { types: new Set(['secret_text']) },
  ],
  [
    'NEXT_PUBLIC_SUPABASE_URL',
    { types: new Set(['secret_text']) },
  ],
  [
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    { types: new Set(['secret_text']) },
  ],
  [
    'NEXT_TAG_CACHE_D1',
    {
      types: new Set(['d1']),
      valid: (binding) =>
        binding.database_id === '5ba0c998-b7bf-4e84-a056-eab1c787eb39',
    },
  ],
  ['SUPABASE_SERVICE_ROLE_KEY', { types: new Set(['secret_text']) }],
  ['TURNSTILE_SECRET_KEY', { types: new Set(['secret_text']) }],
  [
    'WORKER_SELF_REFERENCE',
    {
      types: new Set(['service']),
      valid: (binding) =>
        binding.service === EXPECTED_CLOUDFLARE_WORKER_NAME &&
        binding.environment === 'production' &&
        !Object.hasOwn(binding, 'entrypoint'),
    },
  ],
])

export function pinnedCloudflareEnvironment(environment = {}) {
  const configuredAccount = environment.CLOUDFLARE_ACCOUNT_ID
  if (configuredAccount && configuredAccount !== EXPECTED_CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID does not match the FreeJobPost account')
  }
  return {
    ...environment,
    CLOUDFLARE_ACCOUNT_ID: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  }
}

export function workerScopedArguments(args) {
  if (!Array.isArray(args)) throw new Error('Wrangler arguments are invalid')
  return [
    ...args,
    '--name',
    EXPECTED_CLOUDFLARE_WORKER_NAME,
    '--config',
    wranglerConfig,
  ]
}

function runWrangler(args, { workerScoped = false } = {}) {
  const workerArguments = workerScoped ? workerScopedArguments(args) : args
  const result = spawnSync(process.execPath, [wranglerCli, ...workerArguments], {
    cwd: repositoryRoot,
    env: pinnedCloudflareEnvironment(process.env),
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Wrangler failed with exit code ${result.status}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error('Wrangler returned invalid JSON')
  }
}

export function validateAccountPayload(payload) {
  const matchingAccounts = Array.isArray(payload?.accounts)
    ? payload.accounts.filter(
        (account) => account?.id === EXPECTED_CLOUDFLARE_ACCOUNT_ID,
      )
    : []
  return payload?.loggedIn === true && matchingAccounts.length === 1
}

export function validateVersionPayload(version, expectedVersionId) {
  const bindingList = Array.isArray(version?.resources?.bindings)
    ? version.resources.bindings
    : []
  const bindings = new Map()
  const duplicateNames = []
  for (const binding of bindingList) {
    if (bindings.has(binding.name)) duplicateNames.push(binding.name)
    else bindings.set(binding.name, binding)
  }

  const missing = []
  const wrongType = []
  const wrongValue = []
  const unexpected = [...bindings.keys()].filter(
    (name) => !requiredBindings.has(name),
  )
  for (const [name, contract] of requiredBindings) {
    const binding = bindings.get(name)
    if (!binding) missing.push(name)
    else if (!contract.types.has(binding.type)) wrongType.push(name)
    else if (contract.valid && !contract.valid(binding)) wrongValue.push(name)
  }

  return {
    versionIdMatches: version?.id === expectedVersionId,
    bindingNames: [...bindings.keys()].sort(),
    missing,
    wrongType,
    wrongValue,
    unexpected,
    duplicateNames,
  }
}

export function parseRequestedVersion(args) {
  if (!Array.isArray(args)) throw new Error('Worker binding arguments are invalid')
  if (args.length === 0) return null
  if (args.length !== 2 || args[0] !== '--version') {
    throw new Error('Use no arguments, or exactly --version <Worker version ID>')
  }
  const requestedVersion = args[1]
  if (
    typeof requestedVersion !== 'string' ||
    !WORKER_VERSION_ID_PATTERN.test(requestedVersion)
  ) {
    throw new Error('The requested Worker version ID is malformed')
  }
  return requestedVersion.toLowerCase()
}

export function validateDeploymentPayload(deployment) {
  if (!Array.isArray(deployment?.versions)) {
    throw new Error('Cloudflare deployment status has no versions inventory')
  }
  const seen = new Set()
  const versions = deployment.versions.map((version) => {
    const versionId = version?.version_id
    const percentage = version?.percentage
    if (
      typeof versionId !== 'string' ||
      !WORKER_VERSION_ID_PATTERN.test(versionId)
    ) {
      throw new Error('Cloudflare deployment status has a malformed version ID')
    }
    const normalizedVersionId = versionId.toLowerCase()
    if (seen.has(normalizedVersionId)) {
      throw new Error('Cloudflare deployment status contains a duplicate version ID')
    }
    if (
      typeof percentage !== 'number' ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      throw new Error('Cloudflare deployment status has an invalid traffic percentage')
    }
    seen.add(normalizedVersionId)
    return { version_id: normalizedVersionId, percentage }
  })
  const activeTraffic = versions.reduce(
    (total, version) => total + version.percentage,
    0,
  )
  if (versions.length === 0 || Math.abs(activeTraffic - 100) > 0.000001) {
    throw new Error('Cloudflare deployment status does not account for 100 percent traffic')
  }
  return versions
}

export function candidateTrafficObservation(deployment, candidateVersionId) {
  if (
    typeof candidateVersionId !== 'string' ||
    !WORKER_VERSION_ID_PATTERN.test(candidateVersionId)
  ) {
    throw new Error('The candidate Worker version ID is malformed')
  }
  const normalizedCandidate = candidateVersionId.toLowerCase()
  const versions = validateDeploymentPayload(deployment)
  const candidate = versions.find(
    (version) => version.version_id === normalizedCandidate,
  )
  if (candidate && candidate.percentage > 0) {
    throw new Error('The requested candidate Worker version is receiving traffic')
  }
  return {
    percentage: candidate ? candidate.percentage : null,
    deploymentVersions: versions,
  }
}

export function validateDeploymentSnapshotUnchanged(before, after) {
  if (
    typeof before?.id !== 'string' ||
    before.id.length === 0 ||
    before.id !== after?.id ||
    JSON.stringify(validateDeploymentPayload(before)) !==
      JSON.stringify(validateDeploymentPayload(after))
  ) {
    throw new Error('Cloudflare deployment changed during the binding check')
  }
}

export function checkCloudflareBindings(args, runWranglerImpl = runWrangler) {
  const requestedVersion = parseRequestedVersion(args)
  const account = runWranglerImpl(['whoami', '--json'])
  if (!validateAccountPayload(account)) {
    throw new Error('Wrangler is not authenticated to the pinned FreeJobPost account')
  }

  const deployment = runWranglerImpl(
    ['deployments', 'status', '--json'],
    { workerScoped: true },
  )
  const deploymentVersions = validateDeploymentPayload(deployment)
  let targetVersions
  let mode
  if (requestedVersion) {
    mode = 'candidate-version'
    const traffic = candidateTrafficObservation(deployment, requestedVersion)
    targetVersions = [
      { version_id: requestedVersion, percentage: traffic.percentage },
    ]
  } else {
    mode = 'active-production'
    targetVersions = deploymentVersions.filter(
      (version) => Number(version.percentage) > 0,
    )
    if (targetVersions.length === 0) {
      throw new Error('No active production Worker version found')
    }
  }

  const failures = []
  const checked = []
  for (const target of targetVersions) {
    const version = runWranglerImpl(
      ['versions', 'view', target.version_id, '--json'],
      { workerScoped: true },
    )
    const result = validateVersionPayload(version, target.version_id)
    checked.push({
      versionId: target.version_id,
      percentage: target.percentage,
      bindingNames: result.bindingNames,
    })
    if (
      !result.versionIdMatches ||
      result.missing.length > 0 ||
      result.wrongType.length > 0 ||
      result.wrongValue.length > 0 ||
      result.unexpected.length > 0 ||
      result.duplicateNames.length > 0
    ) {
      failures.push({
        versionId: target.version_id,
        percentage: target.percentage,
        versionIdMismatch: !result.versionIdMatches,
        missing: result.missing,
        wrongType: result.wrongType,
        wrongValue: result.wrongValue,
        unexpected: result.unexpected,
        duplicateNames: result.duplicateNames,
      })
    }
  }

  const deploymentAfter = runWranglerImpl(
    ['deployments', 'status', '--json'],
    { workerScoped: true },
  )
  validateDeploymentSnapshotUnchanged(deployment, deploymentAfter)
  if (requestedVersion) {
    candidateTrafficObservation(deploymentAfter, requestedVersion)
  }

  return { mode, accountIdMatches: true, checked, failures }
}

function main() {
  const report = checkCloudflareBindings(process.argv.slice(2))
  process.stdout.write(
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (report.failures.length > 0) process.exitCode = 1
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) main()
