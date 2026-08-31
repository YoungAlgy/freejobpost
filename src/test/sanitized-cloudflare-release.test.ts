import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import stripJsonComments from 'strip-json-comments'
import {
  classifyTrafficCommandOutcome,
  normalizedDeploymentVersions,
  parseReleaseArguments,
  parseUploadedVersionId,
  validateCandidateRecord,
  validateDeploymentUnchanged,
  validateInstalledVersionsAgainstLockfile,
  validateSingleActiveDeployment,
  validateSupabasePublicKey,
  validateTrafficState,
  validateTrackedReleaseSource,
  validateUntrackedReleaseSource,
  validateWorkerSource,
  validateWranglerConfigSource,
  validatedPublicBuildEnvironment,
  verifySupabasePublicKeyProject,
} from '../../scripts/sanitized-cloudflare-release.mjs'
import {
  candidateTrafficObservation,
  checkCloudflareBindings,
  EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  EXPECTED_CLOUDFLARE_WORKER_NAME,
  parseRequestedVersion,
  pinnedCloudflareEnvironment,
  validateAccountPayload,
  validateDeploymentPayload,
  validateDeploymentSnapshotUnchanged,
  validateVersionPayload,
  workerScopedArguments,
} from '../../scripts/check-cloudflare-bindings.mjs'

const PROJECT_REF = 'tsruqbodyrmxqzhvxret'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`

function legacyJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  )
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.test-signature`
}

function publicBuildEnvironment(overrides: Record<string, string> = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyJwt({
      role: 'anon',
      ref: PROJECT_REF,
    }),
    NEXT_PUBLIC_FREEJOBPOST_SUPPORT_EMAIL: 'support@freejobpost.co',
    ...overrides,
  }
}

function validRemoteBindings() {
  return [
    { name: 'ASSETS', type: 'assets' },
    {
      name: 'NEXT_CACHE_DO_QUEUE',
      type: 'durable_object_namespace',
      class_name: 'DOQueueHandler',
    },
    {
      name: 'NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE',
      type: 'plain_text',
      text: 'true',
    },
    {
      name: 'NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS',
      type: 'plain_text',
      text: '3000',
    },
    {
      name: 'NEXT_INC_CACHE_R2_BUCKET',
      type: 'r2_bucket',
      bucket_name: 'next-inc-cache',
    },
    { name: 'NEXT_PUBLIC_APP_URL', type: 'secret_text' },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', type: 'secret_text' },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', type: 'secret_text' },
    { name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', type: 'secret_text' },
    {
      name: 'NEXT_TAG_CACHE_D1',
      type: 'd1',
      database_id: '5ba0c998-b7bf-4e84-a056-eab1c787eb39',
    },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', type: 'secret_text' },
    { name: 'TURNSTILE_SECRET_KEY', type: 'secret_text' },
    {
      name: 'WORKER_SELF_REFERENCE',
      type: 'service',
      service: 'freejobpost',
      environment: 'production',
    },
  ]
}

describe('sanitized Cloudflare release policy', () => {
  it('pins the public Supabase URL to the shared project exactly', () => {
    expect(validatedPublicBuildEnvironment(publicBuildEnvironment())).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: PROJECT_URL,
    })

    expect(() =>
      validatedPublicBuildEnvironment(
        publicBuildEnvironment({ NEXT_PUBLIC_SUPABASE_URL: `${PROJECT_URL}/` }),
      ),
    ).toThrow(`NEXT_PUBLIC_SUPABASE_URL must be exactly ${PROJECT_URL}.`)
    expect(() =>
      validatedPublicBuildEnvironment(
        publicBuildEnvironment({ NEXT_PUBLIC_SUPABASE_URL: ` ${PROJECT_URL} ` }),
      ),
    ).toThrow('NEXT_PUBLIC_SUPABASE_URL must not contain surrounding whitespace.')
    expect(() =>
      validatedPublicBuildEnvironment(
        publicBuildEnvironment({
          NEXT_PUBLIC_SUPABASE_URL: 'https://another-project.supabase.co',
        }),
      ),
    ).toThrow(`NEXT_PUBLIC_SUPABASE_URL must be exactly ${PROJECT_URL}.`)
  })

  it('requires both the anon role and the shared project ref in a legacy JWT', () => {
    expect(() =>
      validateSupabasePublicKey(legacyJwt({ role: 'anon', ref: PROJECT_REF })),
    ).not.toThrow()
    expect(() =>
      validateSupabasePublicKey(
        legacyJwt({ role: 'service_role', ref: PROJECT_REF }),
      ),
    ).toThrow(/legacy anon-role JWT for the configured project/)
    expect(() =>
      validateSupabasePublicKey(legacyJwt({ role: 'anon', ref: 'wrong-project' })),
    ).toThrow(/legacy anon-role JWT for the configured project/)
  })

  it('allows publishable keys and rejects secret keys', () => {
    expect(() =>
      validateSupabasePublicKey('sb_publishable_1234567890abcdefghijklmnop'),
    ).not.toThrow()
    expect(() =>
      validateSupabasePublicKey(['sb', 'secret', '1234567890abcdefghijklmnop'].join('_')),
    ).toThrow(/received a secret key/)
  })

  it('proves public-key ownership against only the pinned project endpoint', async () => {
    const publicKey = 'sb_publishable_1234567890abcdefghijklmnop'
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))

    await expect(
      verifySupabasePublicKeyProject(publicKey, { fetchImpl }),
    ).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      `${PROJECT_URL}/auth/v1/settings`,
      expect.objectContaining({
        method: 'GET',
        headers: { apikey: publicKey },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('fails the key ownership proof on rejection, network failure, and timeout', async () => {
    const publicKey = 'sb_publishable_1234567890abcdefghijklmnop'
    await expect(
      verifySupabasePublicKeyProject(publicKey, {
        fetchImpl: async () => new Response(null, { status: 401 }),
      }),
    ).rejects.toThrow('did not authorize against the pinned Supabase project')
    await expect(
      verifySupabasePublicKeyProject(publicKey, {
        fetchImpl: async () => {
          throw new Error('private network detail')
        },
      }),
    ).rejects.toThrow('The Supabase public-key ownership check failed.')
    await expect(
      verifySupabasePublicKeyProject(publicKey, {
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          }),
        timeoutMs: 5,
      }),
    ).rejects.toThrow('The Supabase public-key ownership check timed out.')
  })

  it('rejects a malformed key before the ownership request', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    await expect(
      verifySupabasePublicKeyProject('not-a-public-key', { fetchImpl }),
    ).rejects.toThrow('must be a Supabase publishable key')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('requires installed release packages to match package-lock exactly', () => {
    const lockfile = {
      packages: {
        'node_modules/next': { version: '16.3.0' },
        'node_modules/@opennextjs/cloudflare': { version: '1.20.2' },
        'node_modules/wrangler': { version: '4.123.0' },
        'node_modules/es-module-lexer': { version: '2.1.0' },
        'node_modules/strip-json-comments': { version: '3.1.1' },
      },
    }
    const installed = {
      next: '16.3.0',
      '@opennextjs/cloudflare': '1.20.2',
      wrangler: '4.123.0',
      'es-module-lexer': '2.1.0',
      'strip-json-comments': '3.1.1',
    }

    expect(validateInstalledVersionsAgainstLockfile(lockfile, installed)).toEqual(
      installed,
    )
    expect(() =>
      validateInstalledVersionsAgainstLockfile(lockfile, {
        ...installed,
        wrangler: '4.122.0',
      }),
    ).toThrow('wrangler installed version does not match package-lock.json.')
  })

  it('fails closed on tracked changes and allows only the exact protected untracked path', () => {
    expect(() => validateTrackedReleaseSource(' M package.json\0')).toThrow(
      'Release source has staged or unstaged tracked changes.',
    )
    expect(() => validateTrackedReleaseSource('')).not.toThrow()

    expect(
      validateUntrackedReleaseSource({
        trackedProtectedPath: '',
        protectedUntrackedPath: '_migrate_data.mjs\0',
        otherUntrackedStatus: '',
      }),
    ).toEqual({ protectedUntrackedExclusions: ['_migrate_data.mjs'] })
    expect(() =>
      validateUntrackedReleaseSource({
        trackedProtectedPath: '_migrate_data.mjs\0',
        protectedUntrackedPath: '',
        otherUntrackedStatus: '',
      }),
    ).toThrow('must remain outside tracked source')
    expect(() =>
      validateUntrackedReleaseSource({
        trackedProtectedPath: '',
        protectedUntrackedPath: '',
        otherUntrackedStatus: 'unreviewed-source.ts\0',
      }),
    ).toThrow('an untracked file outside the one protected exclusion')
  })

  it('requires the Durable Object export in generated worker source', () => {
    expect(() =>
      validateWorkerSource('const DOQueueHandler = class {}; export { DOQueueHandler }'),
    ).not.toThrow()
    expect(() => validateWorkerSource('export default { fetch() {} }')).toThrow(
      'OpenNext worker does not export DOQueueHandler.',
    )
    for (const falsePositive of [
      '// export { DOQueueHandler }',
      'const note = "export { DOQueueHandler }"; export default note',
      'const DOQueueHandler = class {}; export { DOQueueHandler as Other }',
    ]) {
      expect(() => validateWorkerSource(falsePositive)).toThrow(
        'OpenNext worker does not export DOQueueHandler.',
      )
    }
  })

  it('requires exact resource identities in parsed Wrangler JSONC', () => {
    const config = readFileSync('wrangler.jsonc', 'utf8')
    expect(validateWranglerConfigSource(config)).toBe(5)

    expect(() =>
      validateWranglerConfigSource(
        config.replace('next-inc-cache', 'wrong-r2-bucket'),
      ),
    ).toThrow('wrangler.jsonc has the wrong R2 bucket identity.')
    expect(() =>
      validateWranglerConfigSource(
        config.replace(
          '5ba0c998-b7bf-4e84-a056-eab1c787eb39',
          '00000000-0000-0000-0000-000000000000',
        ),
      ),
    ).toThrow('wrangler.jsonc has the wrong D1 database identity.')
    expect(() =>
      validateWranglerConfigSource(
        config.replace('"class_name": "DOQueueHandler"', '"class_name": "Other"'),
      ),
    ).toThrow('wrangler.jsonc has the wrong Durable Object identity.')
    expect(() =>
      validateWranglerConfigSource(
        config.replace('"service": "freejobpost"', '"service": "other-worker"'),
      ),
    ).toThrow('wrangler.jsonc has the wrong Worker service identity.')

    const parsed = JSON.parse(stripJsonComments(config))
    const withPlaintextSecret = structuredClone(parsed)
    withPlaintextSecret.vars.SUPABASE_SERVICE_ROLE_KEY = 'must-never-be-plaintext'
    expect(() => validateWranglerConfigSource(JSON.stringify(withPlaintextSecret))).toThrow(
      'wrangler.jsonc has unexpected or wrong plaintext variables.',
    )

    const withAssetBypass = structuredClone(parsed)
    withAssetBypass.assets.run_worker_first = false
    expect(() => validateWranglerConfigSource(JSON.stringify(withAssetBypass))).toThrow(
      'wrangler.jsonc has the wrong ASSETS identity.',
    )

    const withDestructiveMigration = structuredClone(parsed)
    withDestructiveMigration.migrations.push({
      tag: 'v2',
      deleted_classes: ['DOQueueHandler'],
    })
    expect(() =>
      validateWranglerConfigSource(JSON.stringify(withDestructiveMigration)),
    ).toThrow('wrangler.jsonc has no DOQueueHandler SQLite migration.')

    const withCrossScriptDurableObject = structuredClone(parsed)
    withCrossScriptDurableObject.durable_objects.bindings[0].script_name = 'other-worker'
    expect(() =>
      validateWranglerConfigSource(JSON.stringify(withCrossScriptDurableObject)),
    ).toThrow('wrangler.jsonc has the wrong Durable Object identity.')

    const withCrossEnvironmentService = structuredClone(parsed)
    withCrossEnvironmentService.services[0].environment = 'preview'
    expect(() =>
      validateWranglerConfigSource(JSON.stringify(withCrossEnvironmentService)),
    ).toThrow('wrangler.jsonc has the wrong Worker service identity.')

    const withUnexpectedBindingSection = structuredClone(parsed)
    withUnexpectedBindingSection.kv_namespaces = []
    expect(() =>
      validateWranglerConfigSource(JSON.stringify(withUnexpectedBindingSection)),
    ).toThrow('wrangler.jsonc has unexpected or missing top-level release keys.')
  })

  it('accepts only exact release and traffic command arguments', () => {
    for (const command of ['build', 'check', 'source-check', 'preview', 'upload']) {
      expect(parseReleaseArguments([command])).toEqual({ command })
    }
    const current = '11111111-2222-4333-8444-555555555555'
    const candidate = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    expect(
      parseReleaseArguments([
        'stage',
        '--current',
        current,
        '--candidate',
        candidate,
      ]),
    ).toEqual({ command: 'stage', currentVersionId: current, candidateVersionId: candidate })
    expect(
      parseReleaseArguments([
        'unstage',
        '--current',
        current,
        '--candidate',
        candidate,
      ]),
    ).toEqual({
      command: 'unstage',
      currentVersionId: current,
      candidateVersionId: candidate,
    })
    expect(
      parseReleaseArguments([
        'promote',
        '--current',
        current,
        '--candidate',
        candidate,
      ]),
    ).toEqual({
      command: 'promote',
      currentVersionId: current,
      candidateVersionId: candidate,
    })
    expect(
      parseReleaseArguments([
        'rollback',
        '--current',
        candidate,
        '--previous',
        current,
      ]),
    ).toEqual({
      command: 'rollback',
      currentVersionId: candidate,
      candidateVersionId: current,
    })
    for (const args of [
      [],
      ['build', 'extra'],
      ['check', '--version'],
      ['sourcecheck'],
      ['upload', '--env', 'other'],
      ['stage', '--candidate', candidate, '--current', current],
      ['unstage', '--current', current, '--previous', candidate],
      ['promote', '--current', current, `--candidate=${candidate}`],
      ['rollback', '--current', candidate, '--candidate', current],
      ['rollback', '--current', candidate, '--previous', current, 'extra'],
    ]) {
      expect(() => parseReleaseArguments(args)).toThrow(
        'Usage: node scripts/sanitized-cloudflare-release.mjs',
      )
    }
    expect(() =>
      parseReleaseArguments([
        'stage',
        '--current',
        current,
        '--candidate',
        current,
      ]),
    ).toThrow('Current and target Worker versions must be different.')
  })

  it('runs preview and zero-traffic upload inside the verified isolated workspace', () => {
    const script = readFileSync('scripts/sanitized-cloudflare-release.mjs', 'utf8')
    expect(script).toContain('async function withVerifiedReleaseWorkspace(')
    expect(script).toContain('await assertReleaseInputsUnchanged(')
    expect(script).toContain('await assertWorkspaceLockMatches(')
    expect(script).toContain('await runCheckedOpenNextCommand(command)')
    expect(script).toContain("[cli, 'upload', '--strict', '--keep-vars']")
    expect(script).toContain("['--version', versionId]")
    expect(script).toContain(
      "resolve(\n    workspace,\n    'scripts',\n    'check-cloudflare-bindings.mjs',\n  )",
    )
    expect(script).toContain(
      'const cloudflareEnvironment = cloudflareCommandEnvironment(childEnvironment)',
    )
    expect(script).toContain('async function runCheckedTrafficCommand(releaseCommand)')
    expect(script).toMatch(
      /pinnedWorkerArguments\(workspace,\s*\[\s*'versions',\s*'deploy'/,
    )
    expect(script).toContain('validateDeploymentUnchanged(deploymentBefore, deploymentAfter)')
    expect(script).toContain("'final pre-change FreeJobPost deployment status'")
    expect(script).toContain('let trafficCommandError = null')
    expect(script).toContain('classifyTrafficCommandOutcome(deploymentAfter, {')
    expect(script).toContain('await readCandidateRecord({')
    expect(script).toContain('EXPECTED_CLOUDFLARE_WORKER_NAME')
    expect(script).not.toContain("resolve(repoRoot, 'scripts', 'check-cloudflare-bindings.mjs')")
    expect(script).not.toContain('npm run cf:check && opennextjs-cloudflare')
  })

  it('parses exactly one immutable uploaded Worker version ID', () => {
    const versionId = '11111111-2222-4333-8444-555555555555'
    expect(parseUploadedVersionId(`Worker Version ID: ${versionId}`)).toBe(versionId)
    expect(
      parseUploadedVersionId(
        `Worker Version ID: ${versionId}\nWorker Version ID: ${versionId}`,
      ),
    ).toBe(versionId)
    expect(() => parseUploadedVersionId('upload complete')).toThrow(
      'one exact uploaded Worker version ID',
    )
    expect(() =>
      parseUploadedVersionId(
        `Worker Version ID: ${versionId}\nWorker Version ID: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
      ),
    ).toThrow('one exact uploaded Worker version ID')
  })

  it('locks upload, stage, promotion, and rollback to exact traffic states', () => {
    const current = '11111111-2222-4333-8444-555555555555'
    const candidate = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const production = {
      id: 'deployment-production',
      versions: [{ version_id: current, percentage: 100 }],
    }
    const staged = {
      id: 'deployment-staged',
      versions: [
        { version_id: current, percentage: 100 },
        { version_id: candidate, percentage: 0 },
      ],
    }
    const promoted = {
      id: 'deployment-promoted',
      versions: [{ version_id: candidate, percentage: 100 }],
    }

    expect(validateSingleActiveDeployment(production)).toBe(current)
    expect(normalizedDeploymentVersions(staged)).toHaveLength(2)
    expect(
      validateDeploymentUnchanged(production, structuredClone(production)),
    ).toHaveLength(1)
    expect(() => validateDeploymentUnchanged(production, staged)).toThrow(
      'Production traffic changed during the candidate upload.',
    )
    expect(
      validateTrafficState(production, {
        phase: 'stage-before',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(1)
    expect(
      validateTrafficState(staged, {
        phase: 'stage-after',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(2)
    expect(
      validateTrafficState(staged, {
        phase: 'unstage-before',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(2)
    expect(
      validateTrafficState(production, {
        phase: 'unstage-after',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(1)
    expect(
      validateTrafficState(staged, {
        phase: 'promote-before',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(2)
    expect(
      validateTrafficState(promoted, {
        phase: 'promote-after',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toHaveLength(1)
    expect(
      validateTrafficState(promoted, {
        phase: 'rollback-before',
        currentVersionId: candidate,
        candidateVersionId: current,
      }),
    ).toHaveLength(1)
    expect(
      validateTrafficState(production, {
        phase: 'rollback-after',
        currentVersionId: candidate,
        candidateVersionId: current,
      }),
    ).toHaveLength(1)
    expect(() =>
      validateTrafficState(production, {
        phase: 'promote-before',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toThrow('promote-before contract')
    const stageOutcome = {
      beforePhase: 'stage-before',
      afterPhase: 'stage-after',
      currentVersionId: current,
      candidateVersionId: candidate,
    }
    expect(classifyTrafficCommandOutcome(staged, stageOutcome)).toBe('desired')
    expect(classifyTrafficCommandOutcome(production, stageOutcome)).toBe('unchanged')
    expect(
      classifyTrafficCommandOutcome(production, {
        beforePhase: 'unstage-before',
        afterPhase: 'unstage-after',
        currentVersionId: current,
        candidateVersionId: candidate,
      }),
    ).toBe('desired')
    expect(
      classifyTrafficCommandOutcome(
        {
          id: 'unexpected',
          versions: [
            { version_id: current, percentage: 50 },
            { version_id: candidate, percentage: 50 },
          ],
        },
        stageOutcome,
      ),
    ).toBe('unknown')
  })

  it('ties traffic commands to the uploaded artifact candidate record', () => {
    const current = '11111111-2222-4333-8444-555555555555'
    const candidate = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const releaseInputs = {
      sourceHead: '1'.repeat(40),
      sourceTree: '2'.repeat(40),
      packageLockSha256: '3'.repeat(64),
    }
    const provenance = { artifactSha256: '4'.repeat(64) }
    const record = {
      schemaVersion: 1,
      buildPolicy: 'clean-commit-public-env-only-v2',
      accountId: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
      workerName: EXPECTED_CLOUDFLARE_WORKER_NAME,
      currentVersionId: current,
      candidateVersionId: candidate,
      ...releaseInputs,
      artifactSha256: provenance.artifactSha256,
    }
    const expected = {
      currentVersionId: current,
      candidateVersionId: candidate,
      releaseInputs,
      provenance,
    }
    expect(validateCandidateRecord(record, expected)).toBe(record)
    expect(() =>
      validateCandidateRecord({ ...record, workerName: 'other-worker' }, expected),
    ).toThrow('wrong workerName')
    expect(() =>
      validateCandidateRecord({ ...record, unexpected: true }, expected),
    ).toThrow('invalid shape')
  })

  it('pins the Cloudflare account and exact active or candidate binding command', () => {
    const versionId = '11111111-2222-4333-8444-555555555555'
    expect(
      validateAccountPayload({
        loggedIn: true,
        accounts: [{ id: EXPECTED_CLOUDFLARE_ACCOUNT_ID }],
      }),
    ).toBe(true)
    expect(
      validateAccountPayload({ loggedIn: true, accounts: [{ id: 'wrong' }] }),
    ).toBe(false)
    expect(EXPECTED_CLOUDFLARE_WORKER_NAME).toBe('freejobpost')
    expect(parseRequestedVersion([])).toBeNull()
    expect(parseRequestedVersion(['--version', versionId])).toBe(versionId)
    for (const args of [
      [`--version=${versionId}`],
      ['--versoin', versionId],
      [versionId],
      ['--version', versionId, 'extra'],
      ['--version', versionId, '--version', versionId],
      ['--version'],
    ]) {
      expect(() => parseRequestedVersion(args)).toThrow(
        'Use no arguments, or exactly --version <Worker version ID>',
      )
    }
  })

  it('reads candidate traffic from the deployment instead of inventing zero percent', () => {
    const active = '11111111-2222-4333-8444-555555555555'
    const candidate = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const production = {
      versions: [{ version_id: active, percentage: 100 }],
    }
    expect(validateDeploymentPayload(production)).toEqual([
      { version_id: active, percentage: 100 },
    ])
    expect(candidateTrafficObservation(production, candidate)).toMatchObject({
      percentage: null,
    })
    expect(
      candidateTrafficObservation(
        {
          versions: [
            { version_id: active, percentage: 100 },
            { version_id: candidate, percentage: 0 },
          ],
        },
        candidate,
      ),
    ).toMatchObject({ percentage: 0 })
    expect(() =>
      candidateTrafficObservation(
        {
          versions: [
            { version_id: active, percentage: 90 },
            { version_id: candidate, percentage: 10 },
          ],
        },
        candidate,
      ),
    ).toThrow('candidate Worker version is receiving traffic')
    expect(() =>
      validateDeploymentPayload({
        versions: [
          { version_id: active, percentage: 90 },
          { version_id: active, percentage: 10 },
        ],
      }),
    ).toThrow('duplicate version ID')
    expect(() =>
      validateDeploymentPayload({
        versions: [{ version_id: [active], percentage: 100 }],
      }),
    ).toThrow('malformed version ID')
    expect(() =>
      validateSingleActiveDeployment({
        versions: [{ version_id: [active], percentage: 100 }],
      }),
    ).toThrow('not a valid Worker version ID')
    expect(() => parseRequestedVersion(['--version', [candidate]])).toThrow(
      'malformed',
    )
  })

  it('executes the pinned binding audit against two unchanged traffic snapshots', () => {
    const active = '11111111-2222-4333-8444-555555555555'
    const deployment = {
      id: 'deployment-one',
      versions: [{ version_id: active, percentage: 100 }],
    }
    const calls: Array<{
      args: string[]
      options: { workerScoped?: boolean }
    }> = []
    const fakeWrangler = (
      args: string[],
      options: { workerScoped?: boolean } = {},
    ) => {
      calls.push({ args, options })
      if (args[0] === 'whoami') {
        return {
          loggedIn: true,
          accounts: [{ id: EXPECTED_CLOUDFLARE_ACCOUNT_ID }],
        }
      }
      if (args[0] === 'deployments') return structuredClone(deployment)
      if (args[0] === 'versions') {
        return {
          id: active,
          resources: { bindings: validRemoteBindings() },
        }
      }
      throw new Error('Unexpected fake Wrangler command')
    }

    expect(checkCloudflareBindings([], fakeWrangler)).toMatchObject({
      mode: 'active-production',
      accountIdMatches: true,
      failures: [],
      checked: [{ versionId: active, percentage: 100 }],
    })
    expect(calls).toEqual([
      { args: ['whoami', '--json'], options: {} },
      {
        args: ['deployments', 'status', '--json'],
        options: { workerScoped: true },
      },
      {
        args: ['versions', 'view', active, '--json'],
        options: { workerScoped: true },
      },
      {
        args: ['deployments', 'status', '--json'],
        options: { workerScoped: true },
      },
    ])

    const scoped = workerScopedArguments(['deployments', 'status', '--json'])
    expect(scoped).toEqual([
      'deployments',
      'status',
      '--json',
      '--name',
      'freejobpost',
      '--config',
      resolve('wrangler.jsonc'),
    ])
    expect(
      pinnedCloudflareEnvironment({ CLOUDFLARE_API_TOKEN: 'test-token' }),
    ).toMatchObject({
      CLOUDFLARE_ACCOUNT_ID: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: 'test-token',
    })
    expect(() =>
      pinnedCloudflareEnvironment({ CLOUDFLARE_ACCOUNT_ID: 'wrong-account' }),
    ).toThrow('does not match the FreeJobPost account')
  })

  it('fails the binding audit when traffic changes during version validation', () => {
    const active = '11111111-2222-4333-8444-555555555555'
    const candidate = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    let deploymentReads = 0
    const fakeWrangler = (args: string[]) => {
      if (args[0] === 'whoami') {
        return {
          loggedIn: true,
          accounts: [{ id: EXPECTED_CLOUDFLARE_ACCOUNT_ID }],
        }
      }
      if (args[0] === 'versions') {
        return {
          id: candidate,
          resources: { bindings: validRemoteBindings() },
        }
      }
      deploymentReads += 1
      return deploymentReads === 1
        ? {
            id: 'deployment-one',
            versions: [{ version_id: active, percentage: 100 }],
          }
        : {
            id: 'deployment-two',
            versions: [{ version_id: candidate, percentage: 100 }],
          }
    }
    expect(() =>
      checkCloudflareBindings(['--version', candidate], fakeWrangler),
    ).toThrow('deployment changed during the binding check')
    expect(() =>
      validateDeploymentSnapshotUnchanged(
        {
          id: 'one',
          versions: [{ version_id: active, percentage: 100 }],
        },
        {
          id: 'two',
          versions: [{ version_id: active, percentage: 100 }],
        },
      ),
    ).toThrow('deployment changed during the binding check')
  })

  it('validates the exact FreeJobPost remote resource inventory', () => {
    const versionId = '11111111-2222-4333-8444-555555555555'
    const bindings = [
      { name: 'ASSETS', type: 'assets' },
      {
        name: 'NEXT_CACHE_DO_QUEUE',
        type: 'durable_object_namespace',
        class_name: 'DOQueueHandler',
      },
      {
        name: 'NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE',
        type: 'plain_text',
        text: 'true',
      },
      {
        name: 'NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS',
        type: 'plain_text',
        text: '3000',
      },
      {
        name: 'NEXT_INC_CACHE_R2_BUCKET',
        type: 'r2_bucket',
        bucket_name: 'next-inc-cache',
      },
      { name: 'NEXT_PUBLIC_APP_URL', type: 'secret_text' },
      { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', type: 'secret_text' },
      { name: 'NEXT_PUBLIC_SUPABASE_URL', type: 'secret_text' },
      { name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', type: 'secret_text' },
      {
        name: 'NEXT_TAG_CACHE_D1',
        type: 'd1',
        database_id: '5ba0c998-b7bf-4e84-a056-eab1c787eb39',
      },
      { name: 'SUPABASE_SERVICE_ROLE_KEY', type: 'secret_text' },
      { name: 'TURNSTILE_SECRET_KEY', type: 'secret_text' },
      {
        name: 'WORKER_SELF_REFERENCE',
        type: 'service',
        service: 'freejobpost',
        environment: 'production',
      },
    ]
    const valid = validateVersionPayload(
      { id: versionId, resources: { bindings } },
      versionId,
    )
    expect(valid).toMatchObject({
      versionIdMatches: true,
      missing: [],
      wrongType: [],
      wrongValue: [],
      unexpected: [],
      duplicateNames: [],
    })

    const invalid = validateVersionPayload(
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        resources: {
          bindings: bindings
            .filter((binding) => binding.name !== 'SUPABASE_SERVICE_ROLE_KEY')
            .map((binding) =>
              binding.name === 'NEXT_CACHE_DO_QUEUE'
                ? { ...binding, script_name: 'other-worker' }
                : binding.name === 'WORKER_SELF_REFERENCE'
                  ? { ...binding, environment: 'preview' }
                  : binding.name === 'NEXT_PUBLIC_APP_URL'
                    ? { ...binding, type: 'plain_text', text: 'https://wrong.example' }
                  : binding,
            )
            .concat({ name: 'UNEXPECTED_SECRET', type: 'secret_text' }),
        },
      },
      versionId,
    )
    expect(invalid.versionIdMatches).toBe(false)
    expect(invalid.missing).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(invalid.wrongValue).toContain('NEXT_CACHE_DO_QUEUE')
    expect(invalid.wrongValue).toContain('WORKER_SELF_REFERENCE')
    expect(invalid.wrongType).toContain('NEXT_PUBLIC_APP_URL')
    expect(invalid.unexpected).toContain('UNEXPECTED_SECRET')

    for (const name of [
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    ]) {
      const wrongPublicType = validateVersionPayload(
        {
          id: versionId,
          resources: {
            bindings: bindings.map((binding) =>
              binding.name === name
                ? { ...binding, type: 'plain_text', text: 'wrong' }
                : binding,
            ),
          },
        },
        versionId,
      )
      expect(wrongPublicType.wrongType).toContain(name)
    }

    const missingServiceEnvironment = validateVersionPayload(
      {
        id: versionId,
        resources: {
          bindings: bindings.map((binding) => {
            if (binding.name !== 'WORKER_SELF_REFERENCE') return binding
            return {
              name: 'WORKER_SELF_REFERENCE',
              type: 'service',
              service: 'freejobpost',
            }
          }),
        },
      },
      versionId,
    )
    expect(missingServiceEnvironment.wrongValue).toContain('WORKER_SELF_REFERENCE')
  })

  it('does not accept binding names that appear only in comments or diagnostics', () => {
    const warningOnly = `{
      "name": "freejobpost",
      "main": ".open-next/worker.js"
    }
    // ASSETS NEXT_INC_CACHE_R2_BUCKET NEXT_TAG_CACHE_D1
    // NEXT_CACHE_DO_QUEUE DOQueueHandler WORKER_SELF_REFERENCE`

    expect(() => validateWranglerConfigSource(warningOnly)).toThrow(
      'wrangler.jsonc has unexpected or missing top-level release keys.',
    )
  })
})
